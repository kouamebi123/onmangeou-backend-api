import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
const exec = promisify(execFile);
const command = process.argv[2];
const required = (key) => {
  if (!process.env[key]) throw new Error(`Variable requise : ${key}`);
  return process.env[key];
};
async function checksum(path) {
  const hash = createHash('sha256');
  for await (const part of createReadStream(path)) hash.update(part);
  return hash.digest('hex');
}
function postgresEnv(urlString) {
  const url = new URL(urlString);
  if (!['postgresql:', 'postgres:'].includes(url.protocol)) throw new Error('URL PostgreSQL requise');
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get('sslmode') || process.env.PGSSLMODE || 'prefer',
  };
}
async function run(binary, args, env = process.env) {
  try {
    return await exec(binary, args, { env, maxBuffer: 4 * 1024 * 1024 });
  } catch {
    throw new Error(`${binary} a échoué. Vérifiez l’installation, les accès et les journaux locaux.`);
  }
}
async function main() {
  if (command === 'check') {
    const base = required('API_BASE_URL')
      .replace(/\/api\/v1\/?$/, '')
      .replace(/\/$/, '');
    for (const path of ['/health/live', '/health/ready']) {
      const response = await fetch(base + path, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`Sonde ${path} : HTTP ${response.status}`);
      console.log(`${path} : OK`);
    }
    if (process.env.ADMIN_ACCESS_TOKEN) {
      const response = await fetch(`${base}/api/v1/admin/operations`, {
        headers: { Authorization: `Bearer ${process.env.ADMIN_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Contrôle des files : HTTP ${response.status}`);
      const { data } = await response.json();
      if (!data.healthy) throw new Error('Des tâches push ou outbox ont plus de 15 minutes de retard');
      console.log('Files : OK');
      console.log(
        `Push : ${data.pushEnabled ? 'activé' : 'désactivé'} ; SMS : ${data.smsProvider} ; écho OTP : ${data.otpEchoEnabled ? 'activé' : 'désactivé'}`,
      );
    }
    return;
  }
  if (command === 'backup') {
    if (process.env.WRITES_PAUSED !== 'true')
      throw new Error(
        'Suspendre les écritures API/workers puis définir WRITES_PAUSED=true pour une copie base/médias cohérente',
      );
    const directory = resolve(required('BACKUP_DIR'));
    const media = resolve(required('MEDIA_LOCAL_ROOT'));
    if (!(await stat(media)).isDirectory()) throw new Error('Répertoire média invalide');
    await mkdir(directory, { mode: 0o700 }); // Never overwrite an existing backup.
    await run(
      'pg_dump',
      ['--format=custom', '--no-owner', '--file', join(directory, 'database.dump')],
      postgresEnv(required('DATABASE_URL')),
    );
    await run('tar', ['-czf', join(directory, 'media.tar.gz'), '-C', media, '.']);
    const files = {};
    for (const name of ['database.dump', 'media.tar.gz']) files[name] = await checksum(join(directory, name));
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files }, null, 2),
      { mode: 0o600, flag: 'wx' },
    );
    console.log('Sauvegarde terminée et empreintes enregistrées. Reprendre les écritures.');
    return;
  }
  if (command === 'restore-check') {
    const directory = resolve(required('BACKUP_DIR'));
    const target = postgresEnv(required('RESTORE_DATABASE_URL'));
    if (!target.PGDATABASE.endsWith('_restore_test') || process.env.RESTORE_CONFIRM !== target.PGDATABASE)
      throw new Error(
        'Utiliser une base dédiée suffixée _restore_test et confirmer son nom via RESTORE_CONFIRM',
      );
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    for (const name of ['database.dump', 'media.tar.gz']) {
      if (manifest.files?.[name] !== (await checksum(join(directory, name))))
        throw new Error(`Empreinte invalide : ${name}`);
    }
    // No --clean: target must be empty; never drop an existing application database.
    await run(
      'pg_restore',
      [
        '--exit-on-error',
        '--no-owner',
        '--no-acl',
        '--dbname',
        target.PGDATABASE,
        join(directory, 'database.dump'),
      ],
      target,
    );
    await run(
      'psql',
      [
        '--no-psqlrc',
        '--set',
        'ON_ERROR_STOP=1',
        '--command',
        'SELECT count(*) FROM users; SELECT count(*) FROM establishments; SELECT count(*) FROM orders;',
      ],
      target,
    );
    await run('tar', ['-tzf', join(directory, 'media.tar.gz')]);
    console.log(
      'Restauration SQL et intégrité de l’archive validées. Vérifier ensuite les parcours et photos sur une API isolée.',
    );
    return;
  }
  throw new Error('Usage : node scripts/operations.mjs check|backup|restore-check');
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
