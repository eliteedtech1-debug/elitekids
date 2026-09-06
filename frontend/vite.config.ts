import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import legacy from '@vitejs/plugin-legacy';
import path from 'path';

export default defineConfig({
  // Legacy build: old Android WebView / Chrome (low-end devices) cannot parse
  // Vite's modern default target (~Chrome 107+), which produced the white-screen
  // login. plugin-legacy transpiles an ES2015 bundle + core-js polyfills and
  // auto-negotiates module vs legacy per browser (covers Android 5+/Chrome 47+).
  plugins: [
    react(),
    tailwindcss(),
    legacy({
      targets: ['ChromeAndroid >= 47', 'Android >= 5', 'Chrome >= 47', 'Firefox >= 54', 'Safari >= 11', 'iOS >= 11'],
      polyfills: true,
      modernPolyfills: true,
      renderLegacyChunks: true,
    }),
  ],
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
