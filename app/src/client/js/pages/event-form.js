import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { describeError, setStatus, setBusy } from '../utils/forms.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { todayString } from '../utils/dates.js';
import {
  getCalendarEvent,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from '../api/calendar.js';

/* Event form — creates or edits a native calendar event. Task-derived
   items are read-only and link back to the task form instead. */

const params = new URLSearchParams(window.location.search);
const eventId = params.get('id');
const presetDate = params.get('date');
const isEdit = Boolean(eventId);

const form = document.getElementById('event-form');
const statusEl = document.getElementById('event-form-status');
const noticeEl = document.querySelector('[data-form-notice]');
const deleteButton = document.querySelector('[data-delete]');

let originalRecurrence = null;

function timeFields() {
  const allDay = form.allDay.checked;
  document.querySelector('[data-time-field="start"]').hidden = allDay;
  document.querySelector('[data-time-field="end"]').hidden = allDay;
}

function recurrenceControls() {
  const frequency = form.recurrenceFrequency.value;
  document.querySelector('[data-repeat-interval]').hidden = frequency === 'NONE';
  document.querySelector('[data-repeat-end]').hidden = frequency === 'NONE';
}

function combine(dateString, timeString) {
  return new Date(`${dateString}T${timeString}`).toISOString();
}

function readReminder() {
  if (form.reminder.value === '') {
    return null;
  }
  return { offsetMinutes: Number(form.reminder.value), enabled: true };
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
  if (form.recurrenceEnd.value) {
    recurrence.endDate = form.recurrenceEnd.value;
  }
  return recurrence;
}

function buildPayload() {
  const allDay = form.allDay.checked;
  const startDate = form.startDate.value;
  const endDate = form.endDate.value || startDate;
  return {
    title: form.title.value.trim(),
    description: form.description.value.trim() || null,
    allDay,
    start: allDay ? startDate : combine(startDate, form.startTime.value || '00:00'),
    end: allDay ? endDate : combine(endDate, form.endTime.value || form.startTime.value || '23:59'),
    category: form.category.value,
    location: form.location.value.trim() || null,
    reminder: readReminder(),
    recurrence: buildRecurrence(),
  };
}

function setRecurrence(rule) {
  form.recurrenceFrequency.value = rule?.frequency ?? 'NONE';
  form.recurrenceInterval.value = String(rule?.interval ?? 1);
  form.recurrenceEnd.value = rule?.endDate ?? '';
  recurrenceControls();
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function prefill(event) {
  form.title.value = event.title;
  form.description.value = event.description ?? '';
  form.allDay.checked = event.allDay;
  form.category.value = event.category ?? 'GENERAL';
  form.location.value = event.location ?? '';
  form.reminder.value =
    event.reminder === null ? '' : String(event.reminder.offsetMinutes);

  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  form.startDate.value = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  form.startTime.value = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  form.endDate.value = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  form.endTime.value = `${pad(end.getHours())}:${pad(end.getMinutes())}`;

  originalRecurrence = event.recurrence;
  setRecurrence(event.recurrence);
  timeFields();

  document.querySelector('[data-form-title]').textContent = 'Edit event';
  document.querySelector('[data-form-subtitle]').textContent =
    'Changes apply to the whole household calendar.';
  document.body.dataset.pageTitle = 'Edit event';
  document.title = 'Edit event — Housewife Diary';
  deleteButton.hidden = false;
}

function showNotice(html) {
  noticeEl.innerHTML = html;
}

function wireEvents() {
  form.allDay.addEventListener('change', () => {
    if (form.allDay.checked && !form.endDate.value) {
      form.endDate.value = form.startDate.value;
    }
    timeFields();
  });
  form.startDate.addEventListener('change', () => {
    if (!form.endDate.value || form.endDate.value < form.startDate.value) {
      form.endDate.value = form.startDate.value;
    }
  });

  form.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    setBusy(form, true);
    setStatus(statusEl, isEdit ? 'Saving changes…' : 'Saving event…', 'muted');
    try {
      const payload = buildPayload();
      if (isEdit) {
        await updateCalendarEvent(eventId, payload);
      } else {
        await createCalendarEvent(payload);
      }
      toast(isEdit ? 'Event updated.' : 'Event created.', { type: 'success' });
      window.location.assign('/pages/calendar.html');
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    } finally {
      setBusy(form, false);
    }
  });

  deleteButton.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Delete event',
      message: 'Delete this event? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteCalendarEvent(eventId);
      toast('Event deleted.', { type: 'success' });
      window.location.assign('/pages/calendar.html');
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
    form.startDate.value = presetDate || todayString();
    form.endDate.value = form.startDate.value;
  }
  timeFields();
  recurrenceControls();
  wireEvents();

  if (isEdit) {
    try {
      const result = await getCalendarEvent(eventId);
      prefill(result.event);
    } catch (error) {
      if (error?.status === 404) {
        showNotice(`
          <div class="alert alert--danger" role="alert">
            This event does not exist or is not in this household.
            <a href="/pages/calendar.html">Back to calendar</a>
          </div>`);
        form.querySelector('[type="submit"]').disabled = true;
        return;
      }
      if (error?.status === 403) {
        showNotice(`
          <div class="alert alert--warning" role="alert">
            <strong>No active household.</strong> Create or join a household to use the calendar.
            <a href="/pages/household.html">Set up a household</a>
          </div>`);
        form.querySelector('[type="submit"]').disabled = true;
        return;
      }
      setStatus(statusEl, describeError(error), 'error');
    }
  }
}

init().catch((error) => {
  setStatus(statusEl, describeError(error), 'error');
});
