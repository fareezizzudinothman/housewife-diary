import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { describeError, setStatus } from '../utils/forms.js';
import { toast } from '../components/toast.js';
import { listNoteTags, createNote, updateNote, getNote } from '../api/notes.js';

/* Note form — create or edit with tag chips. */

const form = document.getElementById('note-form');
const statusEl = document.getElementById('form-status');
const titleEl = document.getElementById('form-title');
const submitBtn = form.querySelector('[data-submit]');
const tagsInput = document.getElementById('tags');
const tagChipsContainer = document.getElementById('tag-chips');

let noteId = null;
let isEditing = false;
let tags = [];

function getQueryId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function renderTagChips() {
  tagChipsContainer.innerHTML = '';
  for (const tag of tags) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'mood-chip--option';
    chip.setAttribute('aria-pressed', 'true');
    chip.innerHTML = `${tag} ${icon('x', { size: 'sm' })}`;
    chip.addEventListener('click', () => removeTag(tag));
    tagChipsContainer.append(chip);
  }
}

function addTag(tag) {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return;
  if (tags.some(t => t.toLowerCase() === normalized)) return;
  if (tags.length >= 10) return;
  tags.push(tag.trim());
  renderTagChips();
  tagsInput.value = '';
}

function removeTag(tag) {
  tags = tags.filter(t => t !== tag);
  renderTagChips();
}

function parseTagsInput(value) {
  return value
    .split(/[,;]\s*|\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

tagsInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    const newTags = parseTagsInput(tagsInput.value);
    for (const tag of newTags) {
      addTag(tag);
    }
  }
});

tagsInput.addEventListener('blur', () => {
  const newTags = parseTagsInput(tagsInput.value);
  for (const tag of newTags) {
    addTag(tag);
  }
});

async function loadNote() {
  form.classList.add('form--loading');
  submitBtn.disabled = true;
  try {
    const data = await getNote(noteId);
    form.title.value = data.title;
    form.content.value = data.content;
    form.category.value = data.category ?? '';
    form.pinned.checked = data.pinned ?? false;
    form.archived.checked = data.archived ?? false;
    tags = data.tags ?? [];
    renderTagChips();
    titleEl.textContent = 'Edit note';
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
    content: form.content.value.trim(),
    category: form.category.value.trim() || null,
    tags,
    pinned: form.pinned.checked,
    archived: form.archived.checked,
  };

  try {
    if (isEditing) {
      await updateNote(noteId, payload);
      toast('Note updated.', { type: 'success' });
    } else {
      await createNote(payload);
      toast('Note created.', { type: 'success' });
    }
    window.location.assign('/pages/notes.html');
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

  noteId = getQueryId();
  isEditing = Boolean(noteId);

  if (isEditing) {
    await loadNote();
  }

  form.addEventListener('submit', handleSubmit);
}

init().catch((error) => {
  setStatus(statusEl, describeError(error), 'error');
});