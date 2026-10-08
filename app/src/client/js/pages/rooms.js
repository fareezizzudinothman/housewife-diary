import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { confirmDialog, openModal } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import {
  listRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom,
} from '../api/home.js';

/* Rooms list — simple compact list with inline create/edit. */

const state = {
  search: '',
  active: true,
  page: 1,
  limit: 24,
};

const listEl = document.querySelector('[data-room-list]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const filterForm = document.getElementById('room-filters');
const statusEl = document.getElementById('room-status');
let roomsDirty = false;

function isFiltered() {
  return Boolean(state.search);
}

function buildRoomRow(room) {
  const row = document.createElement('div');
  row.className = 'item-row';
  if (!room.active) {
    row.classList.add('item-row--muted');
  }

  const body = document.createElement('div');
  body.className = 'item-info';

  const title = document.createElement('a');
  title.className = 'room-row__title';
  title.href = `/pages/rooms.html?id=${encodeURIComponent(room.id)}`;
  title.textContent = room.name;
  body.append(title);

  if (room.description) {
    const desc = document.createElement('small');
    desc.textContent = room.description;
    body.append(desc);
  }

  const meta = document.createElement('div');
  meta.className = 'room-row__meta';

  if (room.cleaningCount !== undefined) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = `${room.cleaningCount} cleaning schedule${room.cleaningCount !== 1 ? 's' : ''}`;
    meta.append(chip);
  }

  if (room.maintenanceCount !== undefined) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = `${room.maintenanceCount} maintenance item${room.maintenanceCount !== 1 ? 's' : ''}`;
    meta.append(chip);
  }

  if (!room.active) {
    meta.append(document.createTextNode('Archived'));
  }

  body.append(meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const edit = document.createElement('a');
  edit.className = 'icon-btn';
  edit.href = `/pages/rooms.html?id=${encodeURIComponent(room.id)}`;
  edit.setAttribute('aria-label', `Edit ${room.name}`);
  edit.innerHTML = icon('pencil');

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', room.active ? `Archive ${room.name}` : `Restore ${room.name}`);
  remove.innerHTML = room.active ? icon('archive') : icon('door');
  remove.addEventListener('click', () => toggleArchive(room));

  actions.append(edit, remove);
  row.append(body, actions);
  return row;
}

function renderRooms(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const room of items) {
    list.append(buildRoomRow(room));
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
      iconName: 'door',
      title: 'No rooms match',
      text: 'Try different search terms or clear the filters.',
      action: '<button type="button" class="btn btn--secondary btn--small" data-clear-filters>Clear filters</button>',
    });
  }
  return emptyState({
    iconName: 'door',
    title: 'No rooms yet',
    text: 'Add your first room to organize cleaning and maintenance.',
    action: '<a class="btn btn--primary btn--small" href="/pages/rooms.html?new=1">Add a room</a>',
  });
}

async function load() {
  listEl.innerHTML = loadingState('Loading rooms…');
  pagerEl.hidden = true;
  setStatus(statusEl, '');

  try {
    const data = await listRooms(state);
    if (!data.items.length) {
      listEl.innerHTML = emptyStateHtml();
      const clear = listEl.querySelector('[data-clear-filters]');
      if (clear) {
        clear.addEventListener('click', resetFilters);
      }
      if (isFiltered()) {
        setStatus(statusEl, 'No matching rooms.');
      }
      return;
    }
    renderRooms(data.items);
    renderPagination(data);
    setStatus(
      statusEl,
      `${data.total} ${data.total === 1 ? 'room' : 'rooms'}${isFiltered() ? ' match' : ''}`,
    );
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to manage rooms.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function readFilters() {
  state.search = filterForm.search.value.trim();
  const activeVal = filterForm.active.value;
  state.active = activeVal === '' ? undefined : activeVal === 'true';
}

function resetFilters() {
  filterForm.reset();
  readFilters();
  state.page = 1;
  load();
}

async function toggleArchive(room) {
  const confirmed = await confirmDialog({
    title: room.active ? 'Archive room' : 'Restore room',
    message: room.active
      ? `Archive "${room.name}"? It will be hidden from active lists but can be restored.`
      : `Restore "${room.name}"? It will reappear in active lists.`,
    confirmLabel: room.active ? 'Archive' : 'Restore',
    danger: room.active,
  });
  if (!confirmed) {
    return;
  }
  try {
    await updateRoom(room.id, { active: !room.active });
    toast(room.active ? 'Room archived.' : 'Room restored.', { type: 'success' });
    await load();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

function openRoomModal(room = null) {
  const isEdit = Boolean(room);
  const body = document.createElement('div');
  body.innerHTML = `
    <form id="room-form" class="form" novalidate>
      <input type="hidden" name="id" value="${room?.id ?? ''}">
      <div class="field">
        <label for="room-name">Name <span aria-hidden="true">*</span></label>
        <input type="text" id="room-name" name="name" maxlength="80" required value="${room?.name ?? ''}" autocomplete="off">
      </div>
      <div class="field">
        <label for="room-description">Description</label>
        <textarea id="room-description" name="description" maxlength="500" rows="3" placeholder="Notes about this room…">${room?.description ?? ''}</textarea>
      </div>
      <p class="form-status" id="room-form-status" role="status" aria-live="polite"></p>
      <div class="form-actions">
        <button type="submit" class="btn btn--primary">${isEdit ? 'Save' : 'Add'}</button>
        <button type="button" class="btn btn--secondary" data-modal-close>${isEdit ? 'Cancel' : 'Close'}</button>
      </div>
    </form>`;

  const form = body.querySelector('#room-form');
  const formStatus = body.querySelector('#room-form-status');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    setStatus(formStatus, '');

    const payload = {
      name: form.name.value.trim(),
      description: form.description.value.trim() || null,
    };

    try {
      if (isEdit) {
        await updateRoom(room.id, payload);
        toast('Room updated.', { type: 'success' });
      } else {
        await createRoom(payload);
        toast('Room added.', { type: 'success' });
      }
      roomsDirty = true;
      openModal({ title: isEdit ? 'Edit room' : 'Add room', body, onClose: () => {} });
      await load();
    } catch (error) {
      setStatus(formStatus, describeError(error), 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  openModal({
    title: isEdit ? 'Edit room' : 'Add room',
    body,
    onClose: async () => {
      if (roomsDirty) {
        roomsDirty = false;
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
  filterForm.active.addEventListener('change', () => {
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
    history.replaceState(null, '', '/pages/rooms.html');
    openRoomModal();
  }

  // Check for ?id= to open edit modal
  const editId = params.get('id');
  if (editId && editId !== 'new') {
    history.replaceState(null, '', '/pages/rooms.html');
    getRoom(editId).then((room) => openRoomModal(room)).catch(() => {});
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