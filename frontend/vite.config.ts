import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import legacy from '@vitejs/plugin-legacy';
import path from 'path';
import { lstatSync } from 'node:fs';
import { buildCompatCss } from './scripts/compat-css.mjs';

// Refuse to build straight into the live nginx docroot.
// Deploys publish via scripts/rebuild-frontend.sh, which builds into
// `dist.staging` and flips the docroot symlink onto a versioned release. A plain
// `npm run build` defaults to outDir `dist` — which IS the docroot symlink, so
// vite would empty the live release out from under nginx (the 2026-09-14
// outage). Fail loudly instead of silently destroying production.
function guardLiveDocrootPlugin(): Plugin {
  return {
    name: 'elitekids-guard-live-docroot',
    apply: 'build',
    configResolved(config) {
      if (config.command !== 'build') return;
      const outDir = path.resolve(__dirname, config.build.outDir);
      let isLink = false;
      try {
        isLink = lstatSync(outDir).isSymbolicLink();
      } catch {
        return; // not built yet — nothing to protect
      }
      if (isLink) {
        throw new Error(
          `refusing to build: ${outDir} is a symlink (the live nginx docroot).\n` +
            `A plain build would empty the live release. Publish with:\n` +
            `  bash scripts/rebuild-frontend.sh   # staging build + gate + release swap`,
        );
      }
    },
  };
}

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
    guardLiveDocrootPlugin(),
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
