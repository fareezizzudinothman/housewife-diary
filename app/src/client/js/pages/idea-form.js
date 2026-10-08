import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { describeError, setStatus } from '../utils/forms.js';
import { toast } from '../components/toast.js';
import { createIdea, updateIdea, getIdea } from '../api/ideas.js';

/* Idea form — create or edit with category, priority, cost. */

const form = document.getElementById('idea-form');
const statusEl = document.getElementById('form-status');
const titleEl = document.getElementById('form-title');
const submitBtn = form.querySelector('[data-submit]');

let ideaId = null;
let isEditing = false;

function getQueryId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

async function loadIdea() {
  form.classList.add('form--loading');
  submitBtn.disabled = true;
  try {
    const data = await getIdea(ideaId);
    form.title.value = data.title;
    form.description.value = data.description ?? '';
    form.category.value = data.category ?? '';
    form.priority.value = data.priority ?? 'MEDIUM';
    form.status.value = data.status ?? 'IDEA';
    form.estimatedCost.value = data.estimatedCost ?? '';
    form.currency.value = data.currency ?? 'SGD';
    form.notes.value = data.notes ?? '';
    titleEl.textContent = 'Edit idea';
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
    description: form.description.value.trim() || null,
    category: form.category.value.trim() || null,
    priority: form.priority.value,
    status: form.status.value,
    estimatedCost: form.estimatedCost.value ? parseFloat(form.estimatedCost.value).toFixed(2) : null,
    currency: form.currency.value,
    notes: form.notes.value.trim() || null,
  };

  try {
    if (isEditing) {
      await updateIdea(ideaId, payload);
      toast('Idea updated.', { type: 'success' });
    } else {
      await createIdea(payload);
      toast('Idea created.', { type: 'success' });
    }
    window.location.assign('/pages/ideas.html');
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

  ideaId = getQueryId();
  isEditing = Boolean(ideaId);

  if (isEditing) {
    await loadIdea();
  }

  form.addEventListener('submit', handleSubmit);
}

init().catch((error) => {
  setStatus(statusEl, describeError(error), 'error');
});