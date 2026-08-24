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

// E3-offline: app-shell service worker lets kids reopen and play offline.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
