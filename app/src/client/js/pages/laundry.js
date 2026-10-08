import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { confirmDialog, openModal } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatDate } from '../utils/dates.js';
import {
  listLaundry,
  getLaundry,
  createLaundry,
  updateLaundry,
  deleteLaundry,
} from '../api/home.js';

/* Laundry list — compact list with status progression. */

const LAUNDRY_STATUSES = ['PENDING', 'WASHING', 'DRYING', 'FOLDED', 'COMPLETED'];

const state = {
  status: '',
  category: '',
  page: 1,
  limit: 24,
};

const listEl = document.querySelector('[data-laundry-list]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const filterForm = document.getElementById('laundry-filters');
const statusEl = document.getElementById('laundry-status');
let laundryDirty = false;

function isFiltered() {
  return Boolean(state.status || state.category);
}

function statusChip(status) {
  const labels = {
    PENDING: 'Pending',
    WASHING: 'Washing',
    DRYING: 'Drying',
    FOLDED: 'Folded',
    COMPLETED: 'Completed',
  };
  const span = document.createElement('span');
  span.className = `status status--${['COMPLETED', 'FOLDED'].includes(status) ? 'ok' : status === 'PENDING' ? 'warn' : 'info'}`;
  span.textContent = labels[status] ?? status;
  return span;
}

function buildLaundryRow(laundry) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const body = document.createElement('div');
  body.className = 'item-info';

  const title = document.createElement('a');
  title.className = 'laundry-row__title';
  title.href = `/pages/laundry.html?id=${encodeURIComponent(laundry.id)}`;
  title.textContent = laundry.category;
  body.append(title);

  const meta = document.createElement('div');
  meta.className = 'laundry-row__meta';

  meta.append(statusChip(laundry.status));

  if (laundry.scheduledDate) {
    const date = document.createElement('span');
    date.className = 'task-meta-text';
    date.textContent = `Scheduled ${formatDate(laundry.scheduledDate)}`;
    meta.append(date);
  }

  if (laundry.notes) {
    const notes = document.createElement('small');
    notes.textContent = laundry.notes;
    meta.append(notes);
  }

  body.append(meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const edit = document.createElement('a');
  edit.className = 'icon-btn';
  edit.href = `/pages/laundry.html?id=${encodeURIComponent(laundry.id)}`;
  edit.setAttribute('aria-label', `Edit ${laundry.category}`);
  edit.innerHTML = icon('pencil');

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', `Delete ${laundry.category}`);
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', () => deleteLaundryHandler(laundry));

  actions.append(edit, remove);
  row.append(body, actions);
  return row;
}

function renderLaundry(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const laundry of items) {
    list.append(buildLaundryRow(laundry));
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
      iconName: 'shirt',
      title: 'No laundry matches',
      text: 'Try different filters or clear them.',
      action: '<button type="button" class="btn btn--secondary btn--small" data-clear-filters>Clear filters</button>',
    });
  }
  return emptyState({
    iconName: 'shirt',
    title: 'No laundry loads yet',
    text: 'Add your first laundry load to track.',
    action: '<a class="btn btn--primary btn--small" href="/pages/laundry.html?new=1">Add laundry</a>',
  });
}

async function load() {
  listEl.innerHTML = loadingState('Loading laundry…');
  pagerEl.hidden = true;
  setStatus(statusEl, '');

  try {
    const data = await listLaundry(state);
    if (!data.items.length) {
      listEl.innerHTML = emptyStateHtml();
      const clear = listEl.querySelector('[data-clear-filters]');
      if (clear) {
        clear.addEventListener('click', resetFilters);
      }
      if (isFiltered()) {
        setStatus(statusEl, 'No matching laundry.');
      }
      return;
    }
    renderLaundry(data.items);
    renderPagination(data);
    setStatus(
      statusEl,
      `${data.total} ${data.total === 1 ? 'load' : 'loads'}${isFiltered() ? ' match' : ''}`,
    );
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to manage laundry.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function readFilters() {
  state.status = filterForm.status.value;
  state.category = filterForm.category.value.trim();
}

function resetFilters() {
  filterForm.reset();
  readFilters();
  state.page = 1;
  load();
}

async function deleteLaundryHandler(laundry) {
  const confirmed = await confirmDialog({
    title: 'Delete laundry',
    message: `Delete "${laundry.category}"?`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteLaundry(laundry.id);
    toast('Laundry deleted.', { type: 'success' });
    await load();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

function openLaundryModal(laundry = null) {
  const isEdit = Boolean(laundry);
  const body = document.createElement('div');
  body.innerHTML = `
    <form id="laundry-form" class="form" novalidate>
      <input type="hidden" name="id" value="${laundry?.id ?? ''}">
      <div class="field">
        <label for="laundry-category">Category <span aria-hidden="true">*</span></label>
        <input type="text" id="laundry-category" name="category" maxlength="40" required value="${laundry?.category ?? ''}" autocomplete="off" placeholder="e.g. Whites, Colors, Delicates">
      </div>
      <div class="field">
        <label for="laundry-status">Status</label>
        <select id="laundry-status" name="status">
          <option value="PENDING"${laundry?.status === 'PENDING' ? ' selected' : ''}>Pending</option>
          <option value="WASHING"${laundry?.status === 'WASHING' ? ' selected' : ''}>Washing</option>
          <option value="DRYING"${laundry?.status === 'DRYING' ? ' selected' : ''}>Drying</option>
          <option value="FOLDED"${laundry?.status === 'FOLDED' ? ' selected' : ''}>Folded</option>
          <option value="COMPLETED"${laundry?.status === 'COMPLETED' ? ' selected' : ''}>Completed</option>
        </select>
      </div>
      <div class="field">
        <label for="laundry-scheduledDate">Scheduled date</label>
        <input type="date" id="laundry-scheduledDate" name="scheduledDate" value="${laundry?.scheduledDate ?? ''}">
      </div>
      <div class="field">
        <label for="laundry-notes">Notes</label>
        <textarea id="laundry-notes" name="notes" maxlength="500" rows="3" placeholder="Detergent, temperature, special care…">${laundry?.notes ?? ''}</textarea>
      </div>
      <p class="form-status" id="laundry-form-status" role="status" aria-live="polite"></p>
      <div class="form-actions">
        <button type="submit" class="btn btn--primary">${isEdit ? 'Save' : 'Add'}</button>
        <button type="button" class="btn btn--secondary" data-modal-close>${isEdit ? 'Cancel' : 'Close'}</button>
      </div>
    </form>`;

  const form = body.querySelector('#laundry-form');
  const formStatus = body.querySelector('#laundry-form-status');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    setStatus(formStatus, '');

    const payload = {
      category: form.category.value.trim(),
      status: form.status.value,
      scheduledDate: form.scheduledDate.value || null,
      notes: form.notes.value.trim() || null,
    };

    try {
      if (isEdit) {
        await updateLaundry(laundry.id, payload);
        toast('Laundry updated.', { type: 'success' });
      } else {
        await createLaundry(payload);
        toast('Laundry added.', { type: 'success' });
      }
      laundryDirty = true;
      openModal({ title: isEdit ? 'Edit laundry' : 'Add laundry', body, onClose: () => {} });
      await load();
    } catch (error) {
      setStatus(formStatus, describeError(error), 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  openModal({
    title: isEdit ? 'Edit laundry' : 'Add laundry',
    body,
    onClose: async () => {
      if (laundryDirty) {
        laundryDirty = false;
        await load();
      }
    },
  });
}

function wireEvents() {
  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    load();
  });
  filterForm.status.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  filterForm.category.addEventListener('change', () => {
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

  // Check for ?new=1 to open add modal on load
  const params = new URLSearchParams(window.location.search);
  if (params.get('new') === '1') {
    history.replaceState(null, '', '/pages/laundry.html');
    openLaundryModal();
  }

  // Check for ?id= to open edit modal
  const editId = params.get('id');
  if (editId && editId !== 'new') {
    history.replaceState(null, '', '/pages/laundry.html');
    getLaundry(editId).then((laundry) => openLaundryModal(laundry)).catch(() => {});
  }
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