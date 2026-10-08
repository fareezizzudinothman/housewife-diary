import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { confirmDialog, openModal } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import {
  listShoppingLists,
  createShoppingList,
  updateShoppingList,
  deleteShoppingList,
} from '../api/shopping.js';

/* Shopping list index — active lists by default, archived behind a filter. */

const state = { search: '', archived: '', page: 1, limit: 15 };

const listEl = document.querySelector('[data-list]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const statusEl = document.getElementById('shopping-status');
const filtersForm = document.getElementById('shopping-filters');

function formatUpdated(list) {
  const date = new Date(list.updatedAt);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function buildRow(list) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const info = document.createElement('div');
  info.className = 'item-info';
  info.style.flex = '1';

  const title = document.createElement('a');
  title.className = 'recipe-row__title';
  title.href = `/pages/shopping-list.html?id=${encodeURIComponent(list.id)}`;
  title.textContent = list.name;

  const meta = document.createElement('div');
  meta.className = 'recipe-row__meta';
  const remaining = document.createElement('span');
  remaining.className = 'meta-text';
  remaining.textContent =
    list.itemCount === 0
      ? 'Empty list'
      : list.remaining === 0
        ? `All ${list.itemCount} items bought`
        : `${list.remaining} of ${list.itemCount} left`;
  const updated = document.createElement('span');
  updated.className = 'meta-text';
  updated.textContent = `Updated ${formatUpdated(list)}`;
  meta.append(remaining, updated);
  info.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const archive = document.createElement('button');
  archive.type = 'button';
  archive.className = 'icon-btn';
  archive.setAttribute('aria-label', list.archived ? `Unarchive ${list.name}` : `Archive ${list.name}`);
  archive.innerHTML = icon('archive');
  archive.addEventListener('click', async () => {
    try {
      await updateShoppingList(list.id, { archived: !list.archived });
      toast(list.archived ? 'List restored.' : 'List archived.', { type: 'success' });
      await load();
    } catch (error) {
      toast(describeError(error), { type: 'error' });
    }
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', `Delete ${list.name}`);
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Delete list',
      message: `Delete “${list.name}” and all of its items?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteShoppingList(list.id);
      toast('List deleted.', { type: 'success' });
      await load();
    } catch (error) {
      toast(describeError(error), { type: 'error' });
    }
  });

  actions.append(archive, remove);
  row.append(info, actions);
  return row;
}

function renderLists(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const entry of items) {
    list.append(buildRow(entry));
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

async function load() {
  listEl.innerHTML = loadingState('Loading lists…');
  pagerEl.hidden = true;
  setStatus(statusEl, '');

  try {
    const data = await listShoppingLists(state);
    if (!data.items.length) {
      listEl.innerHTML = state.archived
        ? emptyState({
            iconName: 'archive',
            title: 'No archived lists',
            text: 'Lists you archive appear here.',
          })
        : emptyState({
            iconName: 'cart',
            title: 'No shopping lists yet',
            text: 'Create a list, then add items yourself or from a recipe.',
            action: '<button type="button" class="btn btn--primary btn--small" data-empty-new>New list</button>',
          });
      const emptyNew = listEl.querySelector('[data-empty-new]');
      if (emptyNew) {
        emptyNew.addEventListener('click', openNewListModal);
      }
      setStatus(statusEl, '');
      return;
    }
    renderLists(data.items);
    renderPagination(data);
    setStatus(statusEl, `${data.total} ${data.total === 1 ? 'list' : 'lists'}`);
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to keep shopping lists.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function openNewListModal() {
  const body = document.createElement('form');
  body.className = 'form';
  body.innerHTML = `
    <div class="field">
      <label for="new-list-name">Name</label>
      <input type="text" id="new-list-name" maxlength="120" required placeholder="Weekly groceries">
    </div>
    <p class="form-status" data-new-list-status role="status" aria-live="polite"></p>`;

  const modal = openModal({
    title: 'New shopping list',
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: 'Create',
        variant: 'primary',
        onClick: async ({ close }) => {
          const name = body.querySelector('#new-list-name').value.trim();
          const status = body.querySelector('[data-new-list-status]');
          if (!name) {
            setStatus(status, 'Give the list a name.', 'error');
            return;
          }
          try {
            const result = await createShoppingList({ name });
            toast('List created.', { type: 'success' });
            close();
            window.location.assign(
              `/pages/shopping-list.html?id=${encodeURIComponent(result.list.id)}`,
            );
          } catch (error) {
            setStatus(status, describeError(error), 'error');
          }
        },
      },
    ],
  });
  body.querySelector('#new-list-name').focus();
  return modal;
}

function readFilters() {
  state.search = filtersForm.search.value.trim();
  state.archived = filtersForm.archived.checked ? 'true' : '';
}

function resetFilters() {
  filtersForm.reset();
  readFilters();
  state.page = 1;
  load();
}

function wireEvents() {
  document.querySelector('[data-new-list]').addEventListener('click', openNewListModal);
  filtersForm.addEventListener('submit', (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    load();
  });
  filtersForm.archived.addEventListener('change', () => {
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
