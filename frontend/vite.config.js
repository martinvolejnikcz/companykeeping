import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = process.env.COMPANYKEEPING_API_URL || 'http://127.0.0.1:4317';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', proxy: { '/api': backend, '/healthz': backend } }
});
