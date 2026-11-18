import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const restrictImports = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/test/fixtures/**', 'tools/**', 'infra/cdk.out/**', 'apps/web/dist/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.dev.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['packages/core/src/**'],
    rules: restrictImports([{ regex: '^[^.]', message: 'core não depende de nada: só imports relativos.' }]),
  },
  {
    files: ['packages/tom-reports/src/**'],
    rules: restrictImports([{ group: ['@tom/*', '!@tom/core'], message: 'tom-reports só depende de @tom/core.' }]),
  },
  {
    files: ['packages/aws-adapters/src/**'],
    rules: restrictImports([{ group: ['@tom/*', '!@tom/core'], message: 'aws-adapters só depende de @tom/core.' }]),
  },
  {
    files: ['packages/contracts/src/**'],
    rules: restrictImports([{ regex: '^[^.]', message: 'contracts não depende de nada: só imports relativos.' }]),
  },
  {
    files: ['apps/api/src/**'],
    rules: restrictImports([
      { group: ['@tom/*', '!@tom/core', '!@tom/contracts', '!@tom/aws-adapters', '!@tom/tom-reports'], message: 'api só depende de core, contracts, tom-reports e aws-adapters.' },
    ]),
  },
  {
    files: ['packages/landing-core/src/**'],
    rules: restrictImports([{ regex: '^[^.]', message: 'landing-core não depende de nada: só imports relativos.' }]),
  },
  {
    files: ['apps/landing-api/src/**'],
    rules: restrictImports([{ group: ['@tom/*', '!@tom/landing-core'], message: 'landing-api só depende de landing-core (isolada do TOM).' }]),
  },
  {
    files: ['apps/uploader/src/**'],
    rules: restrictImports([
      { group: ['@tom/*', '!@tom/core', '!@tom/tom-reports', '!@tom/contracts'], message: 'uploader só depende de core, tom-reports e contracts.' },
    ]),
  },
  {
    files: ['packages/web-auth/**/*.ts'],
    languageOptions: {
      parserOptions: { project: './packages/web-auth/tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['packages/web-auth/src/**'],
    rules: restrictImports([{ regex: '^[^.]', message: 'web-auth não depende de nada: só imports relativos.' }]),
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { project: './apps/web/tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['apps/web/src/**'],
    // Exceção: o núcleo do enviador (sem Node nem AWS) roda no navegador para ler a pasta do TOM.
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: '@tom/uploader', message: 'No site, só o núcleo sem Node: @tom/uploader/core.' }],
        patterns: [{
          regex: '^@tom/(?!contracts$|web-auth$|uploader$|uploader/core$)',
          message: 'web só depende de contracts (fala com a API por HTTP), do login (@tom/web-auth) e do núcleo do enviador (@tom/uploader/core).',
        }],
      }],
    },
  },
  {
    files: ['*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
