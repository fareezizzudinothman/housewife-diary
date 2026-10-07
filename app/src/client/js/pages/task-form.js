import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { describeError, setStatus, setBusy } from '../utils/forms.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { todayString } from '../utils/dates.js';
import { getTask, createTask, updateTask, deleteTask, getTaskMeta } from '../api/tasks.js';

/* Task form — creates a new task, or edits one when ?id= is present.
   Recurrence rules are sent as structured JSON; the server owns
   occurrence materialization. */

const taskId = new URLSearchParams(window.location.search).get('id');
const isEdit = Boolean(taskId);
const form = document.getElementById('task-form');
const statusEl = document.getElementById('task-form-status');
const noticeEl = document.querySelector('[data-form-notice]');
const repeatBox = document.querySelector('[data-repeat]');
const repeatNote = document.querySelector('[data-repeat-note]');
const deleteButton = document.querySelector('[data-delete]');

let originalRecurrence = null;
let isOccurrence = false;
let seriesId = null;

function recurrenceControls() {
  const frequency = form.recurrenceFrequency.value;
  document.querySelector('[data-repeat-interval]').hidden = frequency === 'NONE';
  document.querySelector('[data-repeat-end]').hidden = frequency === 'NONE';
  document.querySelector('[data-repeat-days]').hidden = frequency !== 'WEEKLY';
}

function selectedWeekdays() {
  return [...form.querySelectorAll('input[name="weekday"]:checked')].map((input) =>
    Number(input.value),
  );
}

function buildRecurrence() {
  const frequency = form.recurrenceFrequency.value;
  if (frequency === 'NONE') {
    return null;
  }
  const recurrence = {
    frequency,
    interval: Math.min(99, Math.max(1, Number(form.recurrenceInterval.value) || 1)),
  };
  const days = selectedWeekdays();
  if (frequency === 'WEEKLY' && days.length) {
    recurrence.daysOfWeek = days;
  }
  if (form.recurrenceEnd.value) {
    recurrence.endDate = form.recurrenceEnd.value;
  }
  return recurrence;
}

function readDueAt() {
  const date = form.dueDate.value;
  if (!date) {
    return null;
  }
  if (!form.dueTime.value) {
    return date;
  }
  return new Date(`${date}T${form.dueTime.value}`).toISOString();
}

function showNotice(html) {
  noticeEl.innerHTML = html;
}

async function populateMeta() {
  const meta = await getTaskMeta();
  const categorySelect = form.categoryId;
  for (const category of meta.categories) {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.append(option);
  }
  const assigneeSelect = form.assignedToId;
  for (const member of meta.members) {
    const option = document.createElement('option');
    option.value = member.id;
    option.textContent = member.name;
    assigneeSelect.append(option);
  }
}

function setRecurrence(rule) {
  form.recurrenceFrequency.value = rule?.frequency ?? 'NONE';
  form.recurrenceInterval.value = String(rule?.interval ?? 1);
  form.recurrenceEnd.value = rule?.endDate ?? '';
  const days = new Set(rule?.daysOfWeek ?? []);
  for (const input of form.querySelectorAll('input[name="weekday"]')) {
    input.checked = days.has(Number(input.value));
  }
  recurrenceControls();
}

function prefillDue(dueAt) {
  if (!dueAt) {
    return;
  }
  const date = new Date(dueAt);
  const pad = (value) => String(value).padStart(2, '0');
  form.dueDate.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const isEndOfDay = date.getHours() === 23 && date.getMinutes() === 59 && date.getSeconds() === 59;
  form.dueTime.value = isEndOfDay ? '' : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function prefill(task) {
  form.title.value = task.title;
  form.description.value = task.description ?? '';
  form.priority.value = task.priority;
  form.status.value = task.status;
  if (task.category) {
    form.categoryId.value = task.category.id;
  }
  if (task.assignee) {
    form.assignedToId.value = task.assignee.id;
  }
  prefillDue(task.dueAt);

  originalRecurrence = task.recurrence;
  isOccurrence = Boolean(task.seriesId);
  seriesId = task.seriesId;
  if (isOccurrence) {
    setRecurrence(null);
    repeatBox.disabled = true;
    repeatNote.hidden = false;
    repeatNote.textContent = 'This is one occurrence of a repeating task.';
    const link = document.createElement('a');
    link.href = `/pages/task-form.html?id=${encodeURIComponent(seriesId)}`;
    link.textContent = ' Edit the whole series';
    repeatNote.append(link);
  } else {
    setRecurrence(task.recurrence);
  }

  document.querySelector('[data-status-field]').hidden = false;
  document.querySelector('[data-form-title]').textContent = 'Edit task';
  document.querySelector('[data-form-subtitle]').textContent =
    'Update details, move the due date or change the repeat.';
  document.body.dataset.pageTitle = 'Edit task';
  document.title = 'Edit task — Housewife Diary';
  deleteButton.hidden = false;
}

function buildPayload() {
  const payload = {
    title: form.title.value.trim(),
    description: form.description.value.trim() || null,
    priority: form.priority.value,
    categoryId: form.categoryId.value || null,
    assignedToId: form.assignedToId.value || null,
    dueAt: readDueAt(),
  };
  if (isEdit) {
    payload.status = form.status.value;
  }
  if (!isOccurrence) {
    const recurrence = buildRecurrence();
    const unchanged =
      isEdit && JSON.stringify(recurrence) === JSON.stringify(originalRecurrence ?? null);
    if (!unchanged) {
      payload.recurrence = recurrence;
    }
  }
  return payload;
}

function wireEvents() {
  form.recurrenceFrequency.addEventListener('change', () => {
    if (form.recurrenceFrequency.value === 'WEEKLY' && !selectedWeekdays().length) {
      const base = form.dueDate.value || todayString();
      const weekday = new Date(`${base}T12:00:00`).getDay();
      const input = form.querySelector(`input[name="weekday"][value="${weekday}"]`);
      if (input) {
        input.checked = true;
      }
    }
    recurrenceControls();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(form, true);
    setStatus(statusEl, isEdit ? 'Saving changes…' : 'Saving task…', 'muted');
    try {
      const payload = buildPayload();
      if (isEdit) {
        await updateTask(taskId, payload);
      } else {
        await createTask(payload);
      }
      toast(isEdit ? 'Task updated.' : 'Task created.', { type: 'success' });
      window.location.assign('/pages/tasks.html');
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    } finally {
      setBusy(form, false);
    }
  });

  deleteButton.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Delete task',
      message: 'Delete this task? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteTask(taskId);
      toast('Task deleted.', { type: 'success' });
      window.location.assign('/pages/tasks.html');
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    }
  });
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);

  if (!isEdit) {
    form.dueDate.value = todayString();
  }
  recurrenceControls();
  wireEvents();

  try {
    await populateMeta();
    if (isEdit) {
      const result = await getTask(taskId);
      prefill(result.task);
    }
  } catch (error) {
    if (error?.status === 404) {
      showNotice(`
        <div class="alert alert--danger" role="alert">
          This task does not exist or is not in this household.
          <a href="/pages/tasks.html">Back to tasks</a>
        </div>`);
      form.querySelector('[type="submit"]').disabled = true;
      return;
    }
    if (error?.status === 403) {
      showNotice(`
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to manage tasks.
          <a href="/pages/household.html">Set up a household</a>
        </div>`);
      form.querySelector('[type="submit"]').disabled = true;
      return;
    }
    setStatus(statusEl, describeError(error), 'error');
  }
}

init().catch((error) => {
  setStatus(statusEl, describeError(error), 'error');
});
