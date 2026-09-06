import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';
import './lib/utils/animations.css';
import { offlineSync } from './lib/offline/sync';

// E3-offline: drain any queued progress as early as possible (idempotent —
// GamePlay re-init is a no-op thanks to the started flag).
offlineSync.init();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: { borderRadius: '12px', fontSize: '14px' },
          success: { iconTheme: { primary: '#0F4D92', secondary: '#fff' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);

// Dismiss the boot splash (index.html inline script) once React has mounted and
// painted. Guarded so it is a no-op anywhere else.
if (typeof window !== 'undefined') {
  (window as unknown as { __ELITE_KIDS_READY__?: boolean }).__ELITE_KIDS_READY__ = true;
  window.setTimeout(() => {
    window.dispatchEvent(new Event('app:ready'));
  }, 0);
}

// E3-offline: app-shell service worker lets kids reopen and play offline.
// E4: listen for background sync messages to drain the offline queue.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_REQUESTED') {
      if (navigator.onLine) {
        offlineSync.drainNow().catch(() => {});
      }
    }
  });
}
