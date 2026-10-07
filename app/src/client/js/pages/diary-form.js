import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { describeError, setStatus, setBusy } from '../utils/forms.js';
import { toast } from '../components/toast.js';
import {
  getDiaryMeta,
  getDiaryEntry,
  createDiaryEntry,
  updateDiaryEntry,
} from '../api/diary.js';

/* Diary entry form — creates a new entry, or edits one when ?id= is
   present. Validation is enforced server-side; this form just mirrors
   the limits for faster feedback. */

const MAX_TAGS = 10;
const TIME_SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'];

const entryId = new URLSearchParams(window.location.search).get('id');
const isEdit = Boolean(entryId);
const form = document.getElementById('diary-form');
const statusEl = document.getElementById('diary-form-status');
const noticeEl = document.querySelector('[data-form-notice]');
const counterEl = document.querySelector('[data-counter]');

const state = { timeOfDay: 'EVENING', mood: '' };

function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function defaultSlot() {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'MORNING';
  }
  if (hour < 18) {
    return 'AFTERNOON';
  }
  return 'EVENING';
}

function setTimeOfDay(value) {
  if (!TIME_SLOTS.includes(value)) {
    return;
  }
  state.timeOfDay = value;
  for (const button of document.querySelectorAll('[data-segmented="timeOfDay"] .segmented__option')) {
    button.setAttribute('aria-pressed', String(button.dataset.value === value));
  }
}

function setMood(value) {
  state.mood = value;
  for (const button of document.querySelectorAll('[data-mood-picker] .mood-chip--option')) {
    button.setAttribute('aria-pressed', String(button.dataset.mood === value));
  }
}

function populateMoodChips(moods) {
  const picker = document.querySelector('[data-mood-picker]');
  for (const mood of moods) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mood-chip mood-chip--option';
    button.dataset.mood = mood.id;
    button.textContent = mood.name;
    button.setAttribute('aria-pressed', 'false');
    picker.append(button);
  }
}

function parseTags(raw) {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS);
}

function updateCounter() {
  counterEl.textContent = `${form.content.value.length} / 20000 characters`;
}

function showNotice(html) {
  noticeEl.innerHTML = html;
}

function wireEvents() {
  document.querySelector('[data-segmented="timeOfDay"]').addEventListener('click', (event) => {
    const button = event.target.closest('.segmented__option');
    if (button) {
      setTimeOfDay(button.dataset.value);
    }
  });
  document.querySelector('[data-mood-picker]').addEventListener('click', (event) => {
    const button = event.target.closest('.mood-chip--option');
    if (button) {
      setMood(button.dataset.mood);
    }
  });
  form.content.addEventListener('input', updateCounter);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      title: form.title.value.trim(),
      entryDate: form.entryDate.value,
      timeOfDay: state.timeOfDay,
      mood: state.mood || null,
      tags: parseTags(form.tags.value),
      content: form.content.value,
    };

    setBusy(form, true);
    setStatus(statusEl, isEdit ? 'Saving changes…' : 'Saving entry…', 'muted');
    try {
      const result = isEdit
        ? await updateDiaryEntry(entryId, payload)
        : await createDiaryEntry(payload);
      toast(isEdit ? 'Entry updated.' : 'Entry saved.', { type: 'success' });
      window.location.assign(
        `/pages/diary-entry.html?id=${encodeURIComponent(result.entry.id)}`,
      );
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    } finally {
      setBusy(form, false);
    }
  });
}

function prefill(entry) {
  form.title.value = entry.title;
  form.entryDate.value = entry.entryDate;
  form.content.value = entry.content;
  form.tags.value = entry.tags.map((tag) => tag.name).join(', ');
  setTimeOfDay(entry.timeOfDay);
  setMood(entry.mood?.id ?? '');
  updateCounter();

  document.querySelector('[data-form-title]').textContent = 'Edit entry';
  document.querySelector('[data-form-subtitle]').textContent =
    'Changes apply to your private diary right away.';
  document.title = `Edit entry — Housewife Diary`;
  document.body.dataset.pageTitle = 'Edit entry';
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);

  state.timeOfDay = defaultSlot();
  setTimeOfDay(state.timeOfDay);
  form.entryDate.value = todayISO();
  updateCounter();
  wireEvents();

  let meta;
  try {
    meta = await getDiaryMeta();
  } catch (error) {
    if (error?.status === 403) {
      showNotice(`
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to write entries.
          <a href="/pages/household.html">Set up a household</a>
        </div>`);
      form.querySelector('[type="submit"]').disabled = true;
      return;
    }
    setStatus(statusEl, describeError(error), 'error');
    return;
  }
  populateMoodChips(meta.moods);

  if (isEdit) {
    try {
      const result = await getDiaryEntry(entryId);
      prefill(result.entry);
    } catch (error) {
      if (error?.status === 404) {
        showNotice(`
          <div class="alert alert--danger" role="alert">
            This entry does not exist or is not yours.
            <a href="/pages/diary.html">Back to diary</a>
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
