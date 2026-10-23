import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const restrictImports = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/test/fixtures/**', 'tools/**'] },
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
    files: ['*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
