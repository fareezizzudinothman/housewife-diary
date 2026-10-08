import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { toast } from '../components/toast.js';
import { describeError, setStatus } from '../utils/forms.js';

/* Export page — generate and download household data export. */

const form = document.getElementById('export-form');
const statusEl = document.getElementById('export-status');
const submitBtn = form.querySelector('[data-submit]');

async function handleSubmit(event) {
  event.preventDefault();
  submitBtn.disabled = true;
  setStatus(statusEl, 'Preparing export…');

  const formData = new FormData(form);
  const params = new URLSearchParams();
  
  for (const [key, value] of formData.entries()) {
    if (value === 'on') {
      params.set(key, 'true');
    } else if (value !== '') {
      params.set(key, value);
    }
  }

  try {
    const format = formData.get('format');
    const response = await fetch(`/api/export?${params.toString()}`, {
      credentials: 'same-origin',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Export failed with status ${response.status}`);
    }

    if (format === 'csv') {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `housewife-diary-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `housewife-diary-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    }

    toast('Export downloaded successfully!', { type: 'success' });
    setStatus(statusEl, '', 'success');
  } catch (error) {
    setStatus(statusEl, error.message, 'error');
    toast(error.message, { type: 'error' });
  } finally {
    submitBtn.disabled = false;
  }
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  form.addEventListener('submit', handleSubmit);
}

init().catch((error) => {
  setStatus(statusEl, error.message, 'error');
});