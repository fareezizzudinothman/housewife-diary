import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatDate } from '../utils/dates.js';
import {
  listNoteTags,
  listNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
} from '../api/notes.js';

/* Notes list — searchable, taggable, pinnable, archivable. */

const state = {
  search: '',
  category: '',
  tag: '',
  pinned: undefined,
  archived: undefined,
  page: 1,
  limit: 20,
};

const listEl = document.querySelector('[data-note-list]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const filterForm = document.getElementById('note-filters');
const statusEl = document.getElementById('note-status');
let tagsCache = [];

function isFiltered() {
  return Boolean(state.search || state.category || state.tag || state.pinned !== undefined || state.archived !== undefined);
}

function tagChip(tag) {
  const span = document.createElement('span');
  span.className = 'tag-chip';
  span.textContent = tag;
  return span;
}

function buildNoteRow(note) {
  const row = document.createElement('div');
  row.className = 'item-row';
  if (note.pinned) {
    row.classList.add('item-row--pinned');
  }
  if (note.archived) {
    row.classList.add('item-row--muted');
  }

  const body = document.createElement('div');
  body.className = 'item-info';

  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.gap = '0.5rem';
  titleRow.style.flexWrap = 'wrap';

  const title = document.createElement('a');
  title.className = 'note-row__title';
  title.href = `/pages/note-form.html?id=${encodeURIComponent(note.id)}`;
  title.textContent = note.title;
  titleRow.append(title);

  if (note.pinned) {
    const pin = document.createElement('span');
    pin.className = 'task-meta-text';
    pin.innerHTML = `${icon('star', { size: 'sm' })} Pinned`;
    titleRow.append(pin);
  }

  if (note.archived) {
    const archived = document.createElement('span');
    archived.className = 'task-meta-text';
    archived.textContent = 'Archived';
    titleRow.append(archived);
  }

  body.append(titleRow);

  if (note.category) {
    const cat = document.createElement('span');
    cat.className = 'tag-chip';
    cat.textContent = note.category;
    body.append(cat);
  }

  if (note.tags?.length) {
    const tagsContainer = document.createElement('div');
    tagsContainer.style.display = 'flex';
    tagsContainer.style.flexWrap = 'wrap';
    tagsContainer.style.gap = '0.3rem';
    tagsContainer.style.marginTop = '0.25rem';
    for (const tag of note.tags) {
      tagsContainer.append(tagChip(tag));
    }
    body.append(tagsContainer);
  }

  const meta = document.createElement('div');
  meta.className = 'note-row__meta';
  meta.style.marginTop = '0.35rem';

  const updated = document.createElement('small');
  updated.textContent = `Updated ${formatDate(note.updatedAt)}`;
  meta.append(updated);

  body.append(meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const edit = document.createElement('a');
  edit.className = 'icon-btn';
  edit.href = `/pages/note-form.html?id=${encodeURIComponent(note.id)}`;
  edit.setAttribute('aria-label', `Edit ${note.title}`);
  edit.innerHTML = icon('pencil');

  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = `icon-btn ${note.pinned ? 'icon-btn--active' : ''}`;
  pin.setAttribute('aria-label', note.pinned ? `Unpin ${note.title}` : `Pin ${note.title}`);
  pin.innerHTML = icon('star');
  pin.addEventListener('click', () => togglePin(note));

  const archive = document.createElement('button');
  archive.type = 'button';
  archive.className = `icon-btn ${note.archived ? 'icon-btn--active' : ''}`;
  archive.setAttribute('aria-label', note.archived ? `Unarchive ${note.title}` : `Archive ${note.title}`);
  archive.innerHTML = icon('archive');
  archive.addEventListener('click', () => toggleArchive(note));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', `Delete ${note.title}`);
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', () => deleteNoteHandler(note));

  actions.append(edit, pin, archive, remove);
  row.append(body, actions);
  return row;
}

function renderNotes(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const note of items) {
    list.append(buildNoteRow(note));
  }
  listEl.replaceChildren(list);
}

function renderPagination(data) {
  const showPager = data.totalPages > 1;
  pagerEl.hidden = !showPager;
  if (!showPager) {
    return;
  }
  pageLabelEl.textContent = `Page ${data.page} of ${data.totalPages}`;
  document.querySelector('[data-page-prev]').disabled = data.page <= 1;
  document.querySelector('[data-page-next]').disabled = data.page >= data.totalPages;
}

function emptyStateHtml() {
  if (isFiltered()) {
    return emptyState({
      iconName: 'sticky-note',
      title: 'No notes match',
      text: 'Try different search terms or clear the filters.',
      action: '<button type="button" class="btn btn--secondary btn--small" data-clear-filters>Clear filters</button>',
    });
  }
  return emptyState({
    iconName: 'sticky-note',
    title: 'No notes yet',
    text: 'Create your first note.',
    action: '<a class="btn btn--primary btn--small" href="/pages/note-form.html">New note</a>',
  });
}

async function loadTags() {
  try {
    const data = await listNoteTags();
    tagsCache = data.tags || [];
  } catch {
    // Ignore
  }
}

async function load() {
  listEl.innerHTML = loadingState('Loading notes…');
  pagerEl.hidden = true;
  setStatus(statusEl, '');

  try {
    const data = await listNotes(state);
    if (!data.items.length) {
      listEl.innerHTML = emptyStateHtml();
      const clear = listEl.querySelector('[data-clear-filters]');
      if (clear) {
        clear.addEventListener('click', resetFilters);
      }
      if (isFiltered()) {
        setStatus(statusEl, 'No matching notes.');
      }
      return;
    }
    renderNotes(data.items);
    renderPagination(data);
    setStatus(
      statusEl,
      `${data.total} ${data.total === 1 ? 'note' : 'notes'}${isFiltered() ? ' match' : ''}`,
    );
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to manage notes.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function readFilters() {
  state.search = filterForm.search.value.trim();
  state.category = filterForm.category.value.trim();
  state.tag = filterForm.tag.value.trim();
  const pinnedVal = filterForm.pinned.value;
  state.pinned = pinnedVal === '' ? undefined : pinnedVal === 'true';
  const archivedVal = filterForm.archived.value;
  state.archived = archivedVal === '' ? undefined : archivedVal === 'true';
}

function resetFilters() {
  filterForm.reset();
  readFilters();
  state.page = 1;
  load();
}

async function togglePin(note) {
  try {
    await updateNote(note.id, { pinned: !note.pinned });
    toast(note.pinned ? 'Note unpinned.' : 'Note pinned.', { type: 'success' });
    await load();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

async function toggleArchive(note) {
  try {
    await updateNote(note.id, { archived: !note.archived });
    toast(note.archived ? 'Note unarchived.' : 'Note archived.', { type: 'success' });
    await load();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

async function deleteNoteHandler(note) {
  const confirmed = await confirmDialog({
    title: 'Delete note',
    message: `Delete "${note.title}"?`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteNote(note.id);
    toast('Note deleted.', { type: 'success' });
    await load();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

function wireEvents() {
  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    load();
  });
  filterForm.pinned.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  filterForm.archived.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  document.querySelector('[data-reset]').addEventListener('click', resetFilters);
  document.querySelector('[data-page-prev]').addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    load();
  });
  document.querySelector('[data-page-next]').addEventListener('click', () => {
    state.page += 1;
    load();
  });
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  await loadTags();
  wireEvents();
  await load();
}

init().catch((error) => {
  listEl.innerHTML = errorState(describeError(error));
});