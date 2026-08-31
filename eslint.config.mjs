// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'openapi/**',
      'src/infrastructure/prisma/generated/**',
      // Sa propre configuration : l'inclure dans le projet TypeScript pour la
      // typer n'apporterait rien et cree une dependance circulaire de resolution.
      'eslint.config.mjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Specification 35.2 : interdiction de contourner le typage.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true },
      ],
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Specification 13.3 : jamais de flottant pour la monnaie.
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Les montants sont en entiers FCFA. Utiliser les utilitaires money.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Utiliser le Clock injectable pour rester testable et coherent avec Africa/Abidjan.",
        },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
    },
  },
  {
    files: ['tests/**/*.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Le seed, les scripts d'outillage et les fichiers de configuration
    // s'executent hors conteneur d'injection : ils n'ont pas d'horloge injectee.
    files: ['prisma/seed.ts', 'scripts/**/*.ts', '*.config.ts', '*.config.mjs'],
    rules: { 'no-console': 'off', 'no-restricted-syntax': 'off' },
  },
  {
    // Seule implementation autorisee a lire l'heure systeme : c'est precisement
    // le role du Clock que le reste du code doit utiliser.
    files: ['src/common/time/clock.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
