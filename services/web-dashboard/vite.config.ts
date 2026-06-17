import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.TASKSTREAM_API_URL ?? 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
});
