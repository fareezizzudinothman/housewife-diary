import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { describeError, setStatus } from '../utils/forms.js';
import { toast } from '../components/toast.js';
import { listRooms, createMaintenance, updateMaintenance, getMaintenance } from '../api/home.js';

/* Maintenance form — create or edit. */

const form = document.getElementById('maintenance-form');
const statusEl = document.getElementById('form-status');
const titleEl = document.getElementById('form-title');
const submitBtn = form.querySelector('[data-submit]');
const roomSelect = document.getElementById('roomId');

let maintenanceId = null;
let isEditing = false;

function getQueryId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

async function loadRooms() {
  try {
    const data = await listRooms({ active: true, limit: 100 });
    roomSelect.length = 1;
    for (const room of data.items) {
      const option = document.createElement('option');
      option.value = room.id;
      option.textContent = room.name;
      roomSelect.append(option);
    }
  } catch {
    // Ignore
  }
}

async function loadMaintenance() {
  form.classList.add('form--loading');
  submitBtn.disabled = true;
  try {
    const data = await getMaintenance(maintenanceId);
    form.title.value = data.title;
    form.category.value = data.category;
    form.scheduledDate.value = data.scheduledDate ?? '';
    form.priority.value = data.priority ?? 'MEDIUM';
    form.status.value = data.status ?? 'OPEN';
    form.roomId.value = data.roomId ?? '';
    form.description.value = data.description ?? '';
    form.notes.value = data.notes ?? '';
    titleEl.textContent = 'Edit maintenance';
  } catch (error) {
    setStatus(statusEl, describeError(error), 'error');
  } finally {
    form.classList.remove('form--loading');
    submitBtn.disabled = false;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  submitBtn.disabled = true;
  setStatus(statusEl, '');

  const payload = {
    title: form.title.value.trim(),
    category: form.category.value.trim(),
    scheduledDate: form.scheduledDate.value,
    priority: form.priority.value,
    status: form.status.value,
    roomId: form.roomId.value || null,
    description: form.description.value.trim() || null,
    notes: form.notes.value.trim() || null,
  };

  try {
    if (isEditing) {
      await updateMaintenance(maintenanceId, payload);
      toast('Maintenance updated.', { type: 'success' });
    } else {
      await createMaintenance(payload);
      toast('Maintenance added.', { type: 'success' });
    }
    window.location.assign('/pages/maintenance.html');
  } catch (error) {
    setStatus(statusEl, describeError(error), 'error');
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

  maintenanceId = getQueryId();
  isEditing = Boolean(maintenanceId);

  await loadRooms();

  if (isEditing) {
    await loadMaintenance();
  }

  form.addEventListener('submit', handleSubmit);
}

init().catch((error) => {
  setStatus(statusEl, describeError(error), 'error');
});