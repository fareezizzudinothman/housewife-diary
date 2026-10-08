import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatDate, formatBytes } from '../utils/dates.js';
import { listDocuments, getDocument, updateDocument, deleteDocument, getDocumentFileUrl } from '../api/documents.js';

/* Documents list — secure private files with category, expiry, size. */

const DOCUMENT_CATEGORIES = ['INSURANCE', 'WARRANTY', 'RECEIPT', 'CONTRACT', 'PROPERTY', 'SCHOOL', 'MEDICAL', 'FINANCIAL', 'OTHER'];
const DOCUMENT_STATUSES = ['ACTIVE', 'EXPIRING_SOON', 'EXPIRED'];

const state = {
  search: '',
  category: '',
  status: '',
  page: 1,
  limit: 24,
};

const listEl = document.querySelector('[data-document-list]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const filterForm = document.getElementById('document-filters');
const statusEl = document.getElementById('document-status');

function isFiltered() {
  return Boolean(state.search || state.category || state.status);
}

function categoryChip(category) {
  const span = document.createElement('span');
  span.className = 'tag-chip';
  span.textContent = category.charAt(0) + category.slice(1).toLowerCase();
  return span;
}

function statusChip(status) {
  const span = document.createElement('span');
  span.className = `status status--${status === 'ACTIVE' ? 'ok' : status === 'EXPIRING_SOON' ? 'warn' : 'error'}`;
  span.textContent = status.replace('_', ' ');
  return span;
}

function buildDocumentRow(document) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const body = document.createElement('div');
  body.className = 'item-info';

  const title = document.createElement('a');
  title.className = 'document-row__title';
  title.href = `/pages/document-form.html?id=${encodeURIComponent(document.id)}`;
  title.textContent = document.title;
  body.append(title);

  const meta = document.createElement('div');
  meta.className = 'document-row__meta';

  meta.append(categoryChip(document.category));

  if (document.expiryDate) {
    const expiry = document.createElement('span');
    expiry.className = 'task-due';
    expiry.textContent = `Expires ${formatDate(document.expiryDate)}`;
    if (document.status === 'EXPIRING_SOON') {
      expiry.classList.add('task-due--overdue');
    } else if (document.status === 'EXPIRED') {
      expiry.classList.add('task-due--overdue');
    }
    meta.append(expiry);
  }

  const size = document.createElement('span');
  size.className = 'task-meta-text';
  size.textContent = formatBytes(document.size);
  meta.append(size);

  meta.append(statusChip(document.status));

  if (document.referenceType) {
    const ref = document.createElement('span');
    ref.className = 'tag-chip';
    ref.textContent = `Linked: ${document.referenceType}`;
    meta.append(ref);
  }

  body.append(meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const view = document.createElement('a');
  view.className = 'icon-btn';
  view.href = getDocumentFileUrl(document.id);
  view.target = '_blank';
  view.rel = 'noopener';
  view.setAttribute('aria-label', `View ${document.title}`);
  view.innerHTML = icon('file-text');

  const edit = document.createElement('a');
  edit.className = 'icon-btn';
  edit.href = `/pages/document-form.html?id=${encodeURIComponent(document.id)}`;
  edit.setAttribute('aria-label', `Edit ${document.title}`);
  edit.innerHTML = icon('pencil');

  const download = document.createElement('a');
  download.className = 'icon-btn';
  download.href = getDocumentFileUrl(document.id);
  download.download = document.title;
  download.setAttribute('aria-label', `Download ${document.title}`);
  download.innerHTML = icon('arrow-right');

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', `Delete ${document.title}`);
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', () => deleteDocumentHandler(document));

  actions.append(view, edit, download, remove);
  row.append(body, actions);
  return row;
}

function renderDocuments(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const doc of items) {
    list.append(buildDocumentRow(doc));
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
      iconName: 'file-stack',
      title: 'No documents match',
      text: 'Try different search terms or clear the filters.',
      action: '<button type="button" class="btn btn--secondary btn--small" data-clear-filters>Clear filters</button>',
    });
  }
  return emptyState({
    iconName: 'file-stack',
    title: 'No documents yet',
    text: 'Upload your first document securely.',
    action: '<a class="btn btn--primary btn--small" href="/pages/document-form.html">Upload document</a>',
  });
}

async function load() {
  listEl.innerHTML = loadingState('Loading documents…');
  pagerEl.hidden = true;
  setStatus(statusEl, '');

  try {
    const data = await listDocuments(state);
    if (!data.items.length) {
      listEl.innerHTML = emptyStateHtml();
      const clear = listEl.querySelector('[data-clear-filters]');
      if (clear) {
        clear.addEventListener('click', resetFilters);
      }
      if (isFiltered()) {
        setStatus(statusEl, 'No matching documents.');
      }
      return;
    }
    renderDocuments(data.items);
    renderPagination(data);
    setStatus(
      statusEl,
      `${data.total} ${data.total === 1 ? 'document' : 'documents'}${isFiltered() ? ' match' : ''}`,
    );
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to manage documents.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function readFilters() {
  state.search = filterForm.search.value.trim();
  state.category = filterForm.category.value;
  state.status = filterForm.status.value;
}

function resetFilters() {
  filterForm.reset();
  readFilters();
  state.page = 1;
  load();
}

async function deleteDocumentHandler(document) {
  const confirmed = await confirmDialog({
    title: 'Delete document',
    message: `Delete "${document.title}"? This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteDocument(document.id);
    toast('Document deleted.', { type: 'success' });
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
  filterForm.category.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  filterForm.status.addEventListener('change', () => {
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
  wireEvents();
  await load();
}

init().catch((error) => {
  listEl.innerHTML = errorState(describeError(error));
});