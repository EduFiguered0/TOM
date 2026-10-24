import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

// Em desenvolvimento, /api vai para a API de testes (mesmo caminho que o CloudFront usa em produção).
const DEV_API = process.env['TOM_DEV_API'] ?? 'https://x6ybqaazfk7blmypuu3utnbexa0zwnen.lambda-url.us-east-2.on.aws';

export default defineConfig({
  plugins: [preact()],
  resolve: { conditions: ['source'] },
  server: { port: 5173, proxy: { '/api': { target: DEV_API, changeOrigin: true } } },
  build: { target: 'es2022', sourcemap: true },
});
