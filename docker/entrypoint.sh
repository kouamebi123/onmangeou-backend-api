#!/bin/sh
set -e

if [ -z "$JWT_PRIVATE_KEY" ] || [ -z "$JWT_PUBLIC_KEY" ]; then
  eval "$(node <<'NODE'
const { generateKeyPairSync } = require('node:crypto');
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
process.stdout.write(`export JWT_PRIVATE_KEY=${JSON.stringify(Buffer.from(privatePem).toString('base64'))}\n`);
process.stdout.write(`export JWT_PUBLIC_KEY=${JSON.stringify(Buffer.from(publicPem).toString('base64'))}\n`);
NODE
)"
fi

if [ -n "$DATABASE_URL" ]; then
  pnpm exec prisma migrate deploy
  if [ "$SEED_ON_START" = "true" ]; then
    pnpm exec prisma db seed
  fi
fi

# One-shot production maintenance. The importer is allowlisted and idempotent:
# it only replaces missing/Unsplash media on known demo fixtures.
if [ "$IMPORT_DEMO_MEDIA_ON_START" = "apply" ]; then
  node --no-experimental-require-module dist/import-demo-media.cjs --apply
fi

if [ "$IMPORT_RESTAURANT_COVERS_ON_START" = "apply-v1" ]; then
  node --no-experimental-require-module dist/import-restaurant-covers.cjs --apply
fi

exec node --no-experimental-require-module dist/run.cjs
