import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = process.env.COMPANYKEEPING_API_URL || 'http://127.0.0.1:4317';
// Spring checks the request's Host against the browser's Origin on mutations.
const proxy = { target: backend, changeOrigin: false };
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', proxy: { '/api': proxy, '/healthz': proxy } }
});
