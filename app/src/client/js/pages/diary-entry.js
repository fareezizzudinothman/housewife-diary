import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { describeError, setStatus } from '../utils/forms.js';
import { confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import {
  getDiaryEntry,
  deleteDiaryEntry,
  uploadAttachment,
  deleteAttachment,
  attachmentUrl,
} from '../api/diary.js';

/* Diary entry detail — full plain-text entry, photos with private
   authenticated streaming, edit/delete actions. User content is only
   ever assigned to textContent. */

const TIME_LABELS = { MORNING: 'Morning', AFTERNOON: 'Afternoon', EVENING: 'Evening' };
const MAX_ATTACHMENTS = 5;

const entryId = new URLSearchParams(window.location.search).get('id');
const bodyEl = document.querySelector('[data-entry-body]');
const noticeEl = document.querySelector('[data-entry-notice]');

let entry = null;

function formatLongDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderHeader() {
  document.querySelector('[data-entry-title]').textContent = entry.title;

  const metaParts = [
    formatLongDate(entry.entryDate),
    TIME_LABELS[entry.timeOfDay] ?? entry.timeOfDay,
  ];
  if (entry.mood) {
    metaParts.push(entry.mood.name);
  }
  document.querySelector('[data-entry-meta]').textContent = metaParts.join(' · ');

  const actions = document.querySelector('[data-entry-actions]');
  actions.hidden = false;
  document.querySelector('[data-edit-link]').href =
    `/pages/diary-form.html?id=${encodeURIComponent(entry.id)}`;
}

function renderContent() {
  const card = document.createElement('section');
  card.className = 'card';

  const content = document.createElement('article');
  content.className = 'entry-content';
  content.textContent = entry.content;

  const tagRow = document.createElement('div');
  tagRow.className = 'diary-entry-row__meta';
  if (entry.mood) {
    const mood = document.createElement('span');
    mood.className = 'mood-chip';
    mood.textContent = entry.mood.name;
    tagRow.append(mood);
  }
  for (const tag of entry.tags) {
    const tagChip = document.createElement('span');
    tagChip.className = 'tag-chip';
    tagChip.textContent = tag.name;
    tagRow.append(tagChip);
  }

  const updated = document.createElement('p');
  updated.className = 'entry-updated';
  updated.textContent = entry.updatedAt !== entry.createdAt
    ? `Last updated ${new Date(entry.updatedAt).toLocaleString()}`
    : `Written ${new Date(entry.createdAt).toLocaleString()}`;

  card.append(content, tagRow, updated);
  bodyEl.replaceChildren(card);
}

function renderAttachments() {
  const section = document.createElement('section');
  section.className = 'card';
  section.dataset.attachments = '';

  const head = document.createElement('div');
  head.className = 'card__head';
  const headText = document.createElement('div');
  headText.className = 'card__head-text';
  const h2 = document.createElement('h2');
  h2.textContent = 'Photos';
  const sub = document.createElement('p');
  sub.textContent = `${entry.attachments.length} of ${MAX_ATTACHMENTS} · up to 5MB each`;
  headText.append(h2, sub);
  head.append(headText);

  const grid = document.createElement('div');
  grid.className = 'attachment-grid';
  if (entry.attachments.length) {
    for (const attachment of entry.attachments) {
      grid.append(buildAttachmentItem(attachment));
    }
  } else {
    const hint = document.createElement('p');
    hint.className = 'field-hint';
    hint.textContent = 'No photos attached to this entry yet.';
    grid.append(hint);
  }

  const uploadRow = document.createElement('div');
  uploadRow.className = 'upload-row';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/gif,image/webp';
  input.dataset.attachmentInput = '';
  input.disabled = entry.attachments.length >= MAX_ATTACHMENTS;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--secondary btn--small';
  button.dataset.attachmentUpload = '';
  button.textContent = 'Add photo';
  button.disabled = entry.attachments.length >= MAX_ATTACHMENTS;
  const status = document.createElement('p');
  status.className = 'form-status';
  status.dataset.attachmentStatus = '';
  status.setAttribute('role', 'status');
  uploadRow.append(input, button, status);

  section.append(head, grid, uploadRow);
  bodyEl.append(section);
}

function buildAttachmentItem(attachment) {
  const item = document.createElement('div');
  item.className = 'attachment';

  const preview = document.createElement('a');
  preview.href = attachmentUrl(entry.id, attachment.id);
  preview.className = 'attachment__preview';
  const img = document.createElement('img');
  img.src = attachmentUrl(entry.id, attachment.id);
  img.alt = attachment.originalName;
  img.loading = 'lazy';
  preview.append(img);

  const info = document.createElement('div');
  info.className = 'attachment__info';
  const name = document.createElement('span');
  name.className = 'attachment__name';
  name.textContent = attachment.originalName;
  const size = document.createElement('small');
  size.textContent = formatBytes(attachment.sizeBytes);
  info.append(name, size);

  const actions = document.createElement('div');
  actions.className = 'attachment__actions';
  const download = document.createElement('a');
  download.className = 'icon-btn';
  download.href = `${attachmentUrl(entry.id, attachment.id)}?download=1`;
  download.setAttribute('aria-label', `Download ${attachment.originalName}`);
  download.innerHTML = icon('arrow-right');
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn';
  remove.setAttribute('aria-label', `Remove ${attachment.originalName}`);
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', () => removeAttachment(attachment));
  actions.append(download, remove);

  item.append(preview, info, actions);
  return item;
}

async function removeAttachment(attachment) {
  const confirmed = await confirmDialog({
    title: 'Remove photo?',
    message: `Delete “${attachment.originalName}” from this entry?`,
    confirmLabel: 'Remove',
    danger: true,
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteAttachment(entry.id, attachment.id);
    toast('Photo removed.', { type: 'success' });
    await loadEntry({ keepNotice: true });
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

async function uploadSelectedFile() {
  const input = document.querySelector('[data-attachment-input]');
  const statusEl = document.querySelector('[data-attachment-status]');
  const file = input.files?.[0];
  if (!file) {
    setStatus(statusEl, 'Choose an image first.', 'warn');
    return;
  }
  const button = document.querySelector('[data-attachment-upload]');
  button.disabled = true;
  setStatus(statusEl, 'Uploading…', 'muted');
  try {
    await uploadAttachment(entry.id, file);
    input.value = '';
    setStatus(statusEl, '', 'success');
    toast('Photo added.', { type: 'success' });
    await loadEntry({ keepNotice: true });
  } catch (error) {
    setStatus(statusEl, describeError(error), 'error');
  } finally {
    const refreshed = document.querySelector('[data-attachment-upload]');
    if (refreshed) {
      refreshed.disabled = entry.attachments.length >= MAX_ATTACHMENTS;
    }
  }
}

async function deleteEntry() {
  const confirmed = await confirmDialog({
    title: 'Delete entry?',
    message: 'This permanently deletes the entry and its photos. This cannot be undone.',
    confirmLabel: 'Delete entry',
    danger: true,
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteDiaryEntry(entry.id);
    toast('Entry deleted.', { type: 'success' });
    window.location.assign('/pages/diary.html');
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

function wireActions() {
  document.querySelector('[data-delete-entry]').addEventListener('click', deleteEntry);
  bodyEl.addEventListener('change', (event) => {
    if (event.target.matches('[data-attachment-input]')) {
      uploadSelectedFile();
    }
  });
  bodyEl.addEventListener('click', (event) => {
    if (event.target.closest('[data-attachment-upload]')) {
      uploadSelectedFile();
    }
  });
}

async function loadEntry({ keepNotice = false } = {}) {
  try {
    const result = await getDiaryEntry(entryId);
    entry = result.entry;
  } catch (error) {
    if (error?.status === 403) {
      noticeEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to read your diary.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      bodyEl.innerHTML = '';
      return;
    }
    if (error?.status === 404) {
      bodyEl.innerHTML = emptyState({
        iconName: 'alert-circle',
        title: 'Entry not found',
        text: 'This entry does not exist or is not yours.',
        action: '<a class="btn btn--secondary btn--small" href="/pages/diary.html">Back to diary</a>',
      });
      return;
    }
    throw error;
  }

  if (!keepNotice) {
    noticeEl.innerHTML = '';
  }
  renderHeader();
  renderContent();
  renderAttachments();
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);

  if (!entryId) {
    bodyEl.innerHTML = emptyState({
      iconName: 'book',
      title: 'No entry selected',
      text: 'Pick an entry from your diary timeline.',
      action: '<a class="btn btn--secondary btn--small" href="/pages/diary.html">Back to diary</a>',
    });
    return;
  }

  bodyEl.innerHTML = loadingState('Loading entry…');
  wireActions();
  await loadEntry();
}

init().catch((error) => {
  bodyEl.innerHTML = errorState(describeError(error));
});
