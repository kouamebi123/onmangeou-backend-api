import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

const coverageScope = process.env['VITEST_COVERAGE_SCOPE'];
const unitCoverageFiles = [
  'src/common/auth/authenticated-actor.ts',
  'src/common/auth/permissions.ts',
  'src/common/identity/phone.ts',
  'src/common/money/money.ts',
  'src/common/pagination/cursor.ts',
  'src/common/security/hashing.ts',
  'src/domains/entitlements/module-codes.ts',
  'src/domains/entitlements/module-pricing.ts',
  'src/domains/organizations/opening-hours.ts',
  'src/domains/organizations/slug.ts',
];

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
      include: coverageScope === 'unit' ? unitCoverageFiles : ['src/**/*.ts'],
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
      // Une suite d'integration ne couvre volontairement qu'une tranche du
      // produit. Le seuil global s'applique aux unités pures et à la commande
      // combinée, jamais à la tranche d'intégration exécutée isolément.
      thresholds:
        coverageScope === 'integration'
          ? undefined
          : {
              // Specification 28.3 : couverture globale indicative >= 80 %.
              lines: 80,
              functions: 80,
              branches: 70,
              statements: 80,
            },
    },
  },
});
