import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Em desenvolvimento, /api vai para a Function URL da landing (LANDING_DEV_API), o mesmo caminho do CloudFront.
const DEV_API = process.env['LANDING_DEV_API'];
if (!DEV_API) console.warn('LANDING_DEV_API não definida: /api não vai responder no servidor local.');

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  resolve: { conditions: ['source'] },
  server: { port: 5174, strictPort: true, ...(DEV_API ? { proxy: { '/api': { target: DEV_API, changeOrigin: true } } } : {}) },
  build: { target: 'es2022', sourcemap: true },
});
