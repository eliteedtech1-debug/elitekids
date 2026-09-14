import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import legacy from '@vitejs/plugin-legacy';
import path from 'path';
import { buildCompatCss } from './scripts/compat-css.mjs';

// Emit a Chrome-47-safe downleveled stylesheet (see scripts/compat-css.mjs).
// Old WebViews can't parse @layer/oklch, so the modern sheet renders as nothing.
function compatCssPlugin(): Plugin {
  // Honour the resolved outDir instead of hardcoding `dist` — the deploy builds
  // into `dist.staging` and publishes that only after validation (see
  // .github/workflows/deploy.yml). Hardcoding `dist` made a staging build write
  // its compat sheet into the LIVE docroot (or silently skip it).
  let outDir = 'dist';
  return {
    name: 'elitekids-compat-css',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      buildCompatCss(path.resolve(__dirname, outDir));
    },
  };
}

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
    compatCssPlugin(),
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
