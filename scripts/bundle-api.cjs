'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const esbuild = require('esbuild');
const root = path.join(__dirname, '..');

const compile = spawnSync(process.execPath, ['--no-experimental-require-module', path.join(__dirname, 'swc-build.cjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (compile.status !== 0) process.exit(compile.status ?? 1);

// Use the supported API rather than relying on platform-specific .bin shims.
for (const [entry, output] of [
  ['dist/main.js', 'dist/run.cjs'],
  ['dist/tools/import-demo-media.js', 'dist/import-demo-media.cjs'],
  ['dist/tools/import-restaurant-covers.js', 'dist/import-restaurant-covers.cjs'],
]) {
  esbuild.buildSync({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: output,
    tsconfig: 'tsconfig.json',
    sourcemap: true,
    logLevel: 'warning',
    inject: ['./scripts/import-meta-url.js'],
    define: { 'import.meta.url': 'import_meta_url' },
    alias: {
      '@nestjs/microservices': './scripts/empty-optional.js',
      '@nestjs/microservices/microservices-module.js': './scripts/empty-optional.js',
      '@nestjs/websockets': './scripts/empty-optional.js',
      '@nestjs/websockets/socket-module.js': './scripts/empty-optional.js',
    },
    external: ['pg-native', 'pino', 'pino-http', 'pino-pretty', 'thread-stream', 'swagger-ui-dist'],
  });
}
