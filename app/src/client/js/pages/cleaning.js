import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { confirmDialog, openModal } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatDate } from '../utils/dates.js';
import {
  listCleaning,
  getCleaning,
  createCleaning,
  updateCleaning,
  deleteCleaning,
  listRooms,
} from '../api/home.js';

/* Cleaning schedules list — compact list with frequency and due status. */

const CLEANING_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'];
const CLEANING_STATUSES = ['ACTIVE', 'PAUSED'];

const state = {
  status: 'ACTIVE',
  roomId: '',
  page: 1,
  limit: 24,
};

const listEl = document.querySelector('[data-cleaning-list]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const filterForm = document.getElementById('cleaning-filters');
const statusEl = document.getElementById('cleaning-status');
const roomSelect = document.getElementById('filter-room');
let cleaningDirty = false;

function isFiltered() {
  return state.status !== 'ACTIVE' || state.roomId;
}

function statusChip(status) {
  const span = document.createElement('span');
  span.className = `status status--${status === 'ACTIVE' ? 'ok' : 'warn'}`;
  span.textContent = status;
  return span;
}

function frequencyLabel(freq, interval) {
  if (interval > 1) {
    return `Every ${interval} ${freq.toLowerCase()}s`;
  }
  return freq.charAt(0) + freq.slice(1).toLowerCase();
}

function buildCleaningRow(cleaning) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const body = document.createElement('div');
  body.className = 'item-info';

  const title = document.createElement('a');
  title.className = 'cleaning-row__title';
  title.href = `/pages/cleaning.html?id=${encodeURIComponent(cleaning.id)}`;
  title.textContent = cleaning.title;
  body.append(title);

  const meta = document.createElement('div');
  meta.className = 'cleaning-row__meta';

  if (cleaning.room) {
    const room = document.createElement('span');
    room.className = 'tag-chip';
    room.textContent = cleaning.room.name;
    meta.append(room);
  }

  const freq = document.createElement('span');
  freq.className = 'tag-chip';
  freq.textContent = frequencyLabel(cleaning.frequency, cleaning.interval);
  meta.append(freq);

  meta.append(statusChip(cleaning.status));

  if (cleaning.assignedFamilyMember) {
    const member = document.createElement('span');
    member.className = 'task-meta-text';
    member.textContent = cleaning.assignedFamilyMember.name;
    meta.append(member);
  }

  if (cleaning.nextDue) {
    const due = document.createElement('span');
    due.className = 'task-due';
    due.textContent = `Due ${formatDate(cleaning.nextDue)}`;
    const dueDate = new Date(cleaning.nextDue);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dueDate < today && cleaning.status === 'ACTIVE') {
      due.classList.add('task-due--overdue');
    }
    meta.append(due);
  }

  body.append(meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const edit = document.createElement('a');
  edit.className = 'icon-btn';
  edit.href = `/pages/cleaning.html?id=${encodeURIComponent(cleaning.id)}`;
  edit.setAttribute('aria-label', `Edit ${cleaning.title}`);
  edit.innerHTML = icon('pencil');

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', `Delete ${cleaning.title}`);
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', () => deleteCleaningHandler(cleaning));

  actions.append(edit, remove);
  row.append(body, actions);
  return row;
}

function renderCleaning(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const cleaning of items) {
    list.append(buildCleaningRow(cleaning));
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
      iconName: 'broom',
      title: 'No schedules match',
      text: 'Try different filters or clear them.',
      action: '<button type="button" class="btn btn--secondary btn--small" data-clear-filters>Clear filters</button>',
    });
  }
  return emptyState({
    iconName: 'broom',
    title: 'No cleaning schedules yet',
    text: 'Add your first recurring cleaning schedule.',
    action: '<a class="btn btn--primary btn--small" href="/pages/cleaning.html?new=1">Add a schedule</a>',
  });
}

async function loadRoomsForFilter() {
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

async function load() {
  listEl.innerHTML = loadingState('Loading cleaning schedules…');
  pagerEl.hidden = true;
  setStatus(statusEl, '');

  try {
    const data = await listCleaning(state);
    if (!data.items.length) {
      listEl.innerHTML = emptyStateHtml();
      const clear = listEl.querySelector('[data-clear-filters]');
      if (clear) {
        clear.addEventListener('click', resetFilters);
      }
      if (isFiltered()) {
        setStatus(statusEl, 'No matching schedules.');
      }
      return;
    }
    renderCleaning(data.items);
    renderPagination(data);
    setStatus(
      statusEl,
      `${data.total} ${data.total === 1 ? 'schedule' : 'schedules'}${isFiltered() ? ' match' : ''}`,
    );
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to manage cleaning.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function readFilters() {
  state.status = filterForm.status.value || 'ACTIVE';
  state.roomId = filterForm.roomId.value || '';
}

function resetFilters() {
  filterForm.reset();
  readFilters();
  state.page = 1;
  load();
}

async function deleteCleaningHandler(cleaning) {
  const confirmed = await confirmDialog({
    title: 'Delete schedule',
    message: `Delete "${cleaning.title}"?`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteCleaning(cleaning.id);
    toast('Schedule deleted.', { type: 'success' });
    await load();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

function openCleaningModal(cleaning = null) {
  const isEdit = Boolean(cleaning);
  const body = document.createElement('div');
  body.innerHTML = `
    <form id="cleaning-form" class="form" novalidate>
      <input type="hidden" name="id" value="${cleaning?.id ?? ''}">
      <div class="field">
        <label for="cleaning-room">Room <span aria-hidden="true">*</span></label>
        <select id="cleaning-room" name="roomId" required></select>
      </div>
      <div class="field">
        <label for="cleaning-title">Title <span aria-hidden="true">*</span></label>
        <input type="text" id="cleaning-title" name="title" maxlength="120" required value="${cleaning?.title ?? ''}" autocomplete="off">
      </div>
      <div class="field">
        <label for="cleaning-frequency">Frequency <span aria-hidden="true">*</span></label>
        <select id="cleaning-frequency" name="frequency" required>
          <option value="DAILY"${cleaning?.frequency === 'DAILY' ? ' selected' : ''}>Daily</option>
          <option value="WEEKLY"${cleaning?.frequency === 'WEEKLY' ? ' selected' : ''}>Weekly</option>
          <option value="MONTHLY"${cleaning?.frequency === 'MONTHLY' ? ' selected' : ''}>Monthly</option>
        </select>
      </div>
      <div class="field">
        <label for="cleaning-interval">Interval</label>
        <input type="number" id="cleaning-interval" name="interval" min="1" max="99" value="${cleaning?.interval ?? 1}">
        <p class="field-hint">Every N days/weeks/months (e.g., 2 for every other week).</p>
      </div>
      <div class="field">
        <label for="cleaning-status">Status</label>
        <select id="cleaning-status" name="status">
          <option value="ACTIVE"${cleaning?.status === 'ACTIVE' ? ' selected' : ''}>Active</option>
          <option value="PAUSED"${cleaning?.status === 'PAUSED' ? ' selected' : ''}>Paused</option>
        </select>
      </div>
      <div class="field">
        <label for="cleaning-assignee">Assigned to</label>
        <select id="cleaning-assignee" name="assignedFamilyMemberId">
          <option value="">Unassigned</option>
        </select>
      </div>
      <div class="field">
        <label for="cleaning-notes">Notes</label>
        <textarea id="cleaning-notes" name="notes" maxlength="1000" rows="3" placeholder="Details…">${cleaning?.notes ?? ''}</textarea>
      </div>
      <p class="form-status" id="cleaning-form-status" role="status" aria-live="polite"></p>
      <div class="form-actions">
        <button type="submit" class="btn btn--primary">${isEdit ? 'Save' : 'Add'}</button>
        <button type="button" class="btn btn--secondary" data-modal-close>${isEdit ? 'Cancel' : 'Close'}</button>
      </div>
    </form>`;

  const form = body.querySelector('#cleaning-form');
  const formStatus = body.querySelector('#cleaning-form-status');
  const roomSelectEl = body.querySelector('#cleaning-room');
  const assigneeSelect = body.querySelector('#cleaning-assignee');

  // Load rooms for dropdown
  listRooms({ active: true, limit: 100 }).then((data) => {
    for (const room of data.items) {
      const option = document.createElement('option');
      option.value = room.id;
      option.textContent = room.name;
      if (cleaning?.roomId === room.id) option.selected = true;
      roomSelectEl.append(option);
    }
  }).catch(() => {});

  // Load family members for assignee
  import('../api/family.js').then(({ listMembers }) => {
    listMembers({ includeArchived: false, limit: 100 }).then((data) => {
      for (const member of data.items) {
        const option = document.createElement('option');
        option.value = member.id;
        option.textContent = member.name;
        if (cleaning?.assignedFamilyMemberId === member.id) option.selected = true;
        assigneeSelect.append(option);
      }
    }).catch(() => {});
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    setStatus(formStatus, '');

    const payload = {
      roomId: form.roomId.value || null,
      title: form.title.value.trim(),
      frequency: form.frequency.value,
      interval: parseInt(form.interval.value, 10) || 1,
      status: form.status.value,
      assignedFamilyMemberId: form.assignedFamilyMemberId.value || null,
      notes: form.notes.value.trim() || null,
    };

    try {
      if (isEdit) {
        await updateCleaning(cleaning.id, payload);
        toast('Schedule updated.', { type: 'success' });
      } else {
        await createCleaning(payload);
        toast('Schedule added.', { type: 'success' });
      }
      cleaningDirty = true;
      openModal({ title: isEdit ? 'Edit schedule' : 'Add schedule', body, onClose: () => {} });
      await load();
    } catch (error) {
      setStatus(formStatus, describeError(error), 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  openModal({
    title: isEdit ? 'Edit schedule' : 'Add schedule',
    body,
    onClose: async () => {
      if (cleaningDirty) {
        cleaningDirty = false;
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
  filterForm.roomId.addEventListener('change', () => {
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
    history.replaceState(null, '', '/pages/cleaning.html');
    openCleaningModal();
  }

  // Check for ?id= to open edit modal
  const editId = params.get('id');
  if (editId && editId !== 'new') {
    history.replaceState(null, '', '/pages/cleaning.html');
    getCleaning(editId).then((cleaning) => openCleaningModal(cleaning)).catch(() => {});
  }
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  await loadRoomsForFilter();
  wireEvents();
  await load();
}

init().catch((error) => {
  listEl.innerHTML = errorState(describeError(error));
});