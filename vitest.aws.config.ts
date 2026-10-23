import { defineConfig } from 'vitest/config';

/** Testes contra a AWS real (stack TomTest). Precisam de credenciais: `aws login --profile tom`. */
export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    include: ['packages/*/test/**/*.aws.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
