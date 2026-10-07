import { getHealth } from './api/health.js';
import { initShell } from './shell.js';

initShell({ withUser: false }).catch(() => {});

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
