import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    include: ['{packages,apps}/*/test/**/*.test.{ts,tsx}', 'infra/test/**/*.test.ts'],
    // Testes contra a AWS real ficam de fora: `npm run test:aws`.
    exclude: ['**/node_modules/**', '**/*.aws.test.ts'],
    environment: 'node',
  },
});
