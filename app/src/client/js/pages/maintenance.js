import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatDate } from '../utils/dates.js';
import {
  listMaintenance,
  getMaintenance,
  updateMaintenance,
  deleteMaintenance,
  generateMaintenanceTask,
  listRooms,
} from '../api/home.js';

/* Maintenance list — compact list with priority, status, scheduled date. */

const MAINTENANCE_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const state = {
  status: '',
  roomId: '',
  page: 1,
  limit: 24,
};

const listEl = document.querySelector('[data-maintenance-list]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const filterForm = document.getElementById('maintenance-filters');
const statusEl = document.getElementById('maintenance-status');
const roomSelect = document.getElementById('filter-room');

function isFiltered() {
  return Boolean(state.status || state.roomId);
}

function statusChip(status) {
  const labels = {
    OPEN: 'Open',
    IN_PROGRESS: 'In progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  const span = document.createElement('span');
  span.className = `status status--${status === 'COMPLETED' ? 'ok' : status === 'CANCELLED' ? 'error' : status === 'IN_PROGRESS' ? 'info' : 'warn'}`;
  span.textContent = labels[status] ?? status;
  return span;
}

function priorityChip(priority) {
  const span = document.createElement('span');
  span.className = `priority-chip priority-chip--${priority}`;
  span.textContent = priority.charAt(0) + priority.slice(1).toLowerCase();
  return span;
}

function buildMaintenanceRow(maintenance) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const body = document.createElement('div');
  body.className = 'item-info';

  const title = document.createElement('a');
  title.className = 'maintenance-row__title';
  title.href = `/pages/maintenance-form.html?id=${encodeURIComponent(maintenance.id)}`;
  title.textContent = maintenance.title;
  body.append(title);

  const meta = document.createElement('div');
  meta.className = 'maintenance-row__meta';

  if (maintenance.room) {
    const room = document.createElement('span');
    room.className = 'tag-chip';
    room.textContent = maintenance.room.name;
    meta.append(room);
  }

  const cat = document.createElement('span');
  cat.className = 'tag-chip';
  cat.textContent = maintenance.category;
  meta.append(cat);

  meta.append(statusChip(maintenance.status));
  meta.append(priorityChip(maintenance.priority));

  if (maintenance.scheduledDate) {
    const date = document.createElement('span');
    date.className = 'task-due';
    date.textContent = `Scheduled ${formatDate(maintenance.scheduledDate)}`;
    const dueDate = new Date(maintenance.scheduledDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dueDate < today && maintenance.status === 'OPEN') {
      date.classList.add('task-due--overdue');
    }
    meta.append(date);
  }

  body.append(meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const edit = document.createElement('a');
  edit.className = 'icon-btn';
  edit.href = `/pages/maintenance-form.html?id=${encodeURIComponent(maintenance.id)}`;
  edit.setAttribute('aria-label', `Edit ${maintenance.title}`);
  edit.innerHTML = icon('pencil');

  const taskBtn = document.createElement('button');
  taskBtn.type = 'button';
  taskBtn.className = 'icon-btn';
  taskBtn.setAttribute('aria-label', `Create task from ${maintenance.title}`);
  taskBtn.innerHTML = icon('list-checks');
  taskBtn.addEventListener('click', () => createTaskFromMaintenance(maintenance));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', `Delete ${maintenance.title}`);
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', () => deleteMaintenanceHandler(maintenance));

  actions.append(edit, taskBtn, remove);
  row.append(body, actions);
  return row;
}

function renderMaintenance(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const maintenance of items) {
    list.append(buildMaintenanceRow(maintenance));
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
      iconName: 'wrench',
      title: 'No maintenance matches',
      text: 'Try different filters or clear them.',
      action: '<button type="button" class="btn btn--secondary btn--small" data-clear-filters>Clear filters</button>',
    });
  }
  return emptyState({
    iconName: 'wrench',
    title: 'No maintenance yet',
    text: 'Add your first maintenance item.',
    action: '<a class="btn btn--primary btn--small" href="/pages/maintenance-form.html">Add maintenance</a>',
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
  listEl.innerHTML = loadingState('Loading maintenance…');
  pagerEl.hidden = true;
  setStatus(statusEl, '');

  try {
    const data = await listMaintenance(state);
    if (!data.items.length) {
      listEl.innerHTML = emptyStateHtml();
      const clear = listEl.querySelector('[data-clear-filters]');
      if (clear) {
        clear.addEventListener('click', resetFilters);
      }
      if (isFiltered()) {
        setStatus(statusEl, 'No matching maintenance.');
      }
      return;
    }
    renderMaintenance(data.items);
    renderPagination(data);
    setStatus(
      statusEl,
      `${data.total} ${data.total === 1 ? 'item' : 'items'}${isFiltered() ? ' match' : ''}`,
    );
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to manage maintenance.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function readFilters() {
  state.status = filterForm.status.value;
  state.roomId = filterForm.roomId.value;
}

function resetFilters() {
  filterForm.reset();
  readFilters();
  state.page = 1;
  load();
}

async function deleteMaintenanceHandler(maintenance) {
  const confirmed = await confirmDialog({
    title: 'Delete maintenance',
    message: `Delete "${maintenance.title}"?`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteMaintenance(maintenance.id);
    toast('Maintenance deleted.', { type: 'success' });
    await load();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

async function createTaskFromMaintenance(maintenance) {
  try {
    await generateMaintenanceTask(maintenance.id);
    toast('Task created from maintenance.', { type: 'success' });
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