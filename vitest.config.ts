import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    include: ['{packages,apps}/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
