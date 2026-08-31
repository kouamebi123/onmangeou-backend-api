'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

function runEsbuild(args) {
  const result = spawnSync('pnpm', ['exec', 'esbuild', ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

const compile = spawnSync(process.execPath, ['--no-experimental-require-module', path.join(__dirname, 'swc-build.cjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const status = runEsbuild(
  [
    'dist/main.js',
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--outfile=dist/run.cjs',
    '--tsconfig=tsconfig.json',
    '--sourcemap',
    '--log-level=warning',
    '--inject:./scripts/import-meta-url.js',
    '--define:import.meta.url=import_meta_url',
    '--alias:@nestjs/microservices=./scripts/empty-optional.js',
    '--alias:@nestjs/microservices/microservices-module.js=./scripts/empty-optional.js',
    '--alias:@nestjs/websockets=./scripts/empty-optional.js',
    '--alias:@nestjs/websockets/socket-module.js=./scripts/empty-optional.js',
    '--external:pg-native',
    '--external:pino',
    '--external:pino-http',
    '--external:pino-pretty',
    '--external:thread-stream',
    '--external:swagger-ui-dist',
  ],
);

if (status !== 0) {
  process.exit(status);
}
