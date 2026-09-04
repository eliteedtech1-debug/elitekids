import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 34601,
    proxy: {
      '/kids/live': {
        target: 'http://localhost:34600',
        ws: true,
      },
      '/kids/chat': {
        target: 'http://localhost:34600',
        ws: true,
      },
      '/kids/teams': {
        target: 'http://localhost:34600',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:34600',
      },
    },
  },
});
