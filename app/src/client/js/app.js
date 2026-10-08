import { getHealth } from './api/health.js';
import { initShell } from './shell.js';

initShell({ withUser: false }).catch(() => {});

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[SW] Service Worker registered:', registration.scope);
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[SW] New version available');
              // Could show a toast to user here
            }
          });
        });
      })
      .catch((error) => {
        console.error('[SW] Service Worker registration failed:', error);
      });
  });
}

const statusText = document.querySelector('#status-text');

function setStatus(state, message) {
  statusText.textContent = message;
  statusText.className = `status status--${state}`;
}

async function checkSystemStatus() {
  try {
    const health = await getHealth();
    if (health.status === 'ok' && health.database === 'connected') {
      setStatus('ok', 'All systems running — API and database connected.');
    } else {
      setStatus('warn', 'The API is running, but the database needs attention.');
    }
  } catch {
    setStatus('warn', 'Could not reach the API. Is the server running?');
  }
}

checkSystemStatus();
