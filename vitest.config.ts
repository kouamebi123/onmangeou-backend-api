import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  // Le plugin SWC emet les metadonnees de decorateurs requises par l'injection
  // Nest. esbuild, utilise par defaut, ne les produit pas : sans SWC, toutes les
  // dependances injectees seraient indefinies au demarrage du conteneur.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    // Resolution native des alias de chemins declares dans tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.spec.ts', 'src/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.spec.ts', 'tests/contract/**/*.spec.ts'],
          globalSetup: ['tests/global-setup.ts'],
          setupFiles: ['tests/setup-integration.ts'],
          hookTimeout: 60_000,
          testTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.module.ts',
        'src/**/dto/**',
        'src/main.ts',
        'src/worker.ts',
        'src/bootstrap.ts',
        'src/api/openapi/openapi.setup.ts',
        'src/infrastructure/prisma/generated/**',
      ],
      thresholds: {
        // Specification 28.3 : couverture globale indicative >= 80 %.
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
