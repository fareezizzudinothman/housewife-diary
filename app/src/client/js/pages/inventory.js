import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { confirmDialog, openModal } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatDate } from '../utils/dates.js';
import {
  listInventory,
  consumeInventoryItem,
  wasteInventoryItem,
  addInventoryStock,
  deleteInventoryItem,
} from '../api/inventory.js';

/* Inventory list — derived stock/expiry status kept visually quiet unless
   something needs attention. Quantity changes always go through modals. */

const CATEGORY_LABELS = {
  PRODUCE: 'Produce',
  MEAT: 'Meat',
  SEAFOOD: 'Seafood',
  DAIRY: 'Dairy',
  PANTRY: 'Pantry',
  FROZEN: 'Frozen',
  DRINKS: 'Drinks',
  HOUSEHOLD: 'Household',
  OTHER: 'Other',
};

const LOCATION_LABELS = {
  PANTRY: 'Pantry',
  REFRIGERATOR: 'Refrigerator',
  FREEZER: 'Freezer',
  HOUSEHOLD: 'Household',
  OTHER: 'Other',
};

const STOCK_LABELS = { LOW_STOCK: 'Low stock', OUT_OF_STOCK: 'Out of stock' };
const EXPIRY_LABELS = { EXPIRING_SOON: 'Expiring soon', EXPIRED: 'Expired' };

const state = {
  search: '',
  category: '',
  location: '',
  stock: '',
  expiry: '',
  page: 1,
  limit: 20,
};

const listEl = document.querySelector('[data-inventory-list]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const statusEl = document.getElementById('inventory-status');
const filtersForm = document.getElementById('inventory-filters');

function quantityLabel(item) {
  const quantity = String(item.quantity);
  return item.unit ? `${quantity} ${item.unit}` : quantity;
}

function chip(text, className) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function metaText(text) {
  const span = document.createElement('span');
  span.className = 'meta-text';
  span.textContent = text;
  return span;
}

function buildRow(item) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const info = document.createElement('div');
  info.className = 'item-info';
  info.style.flex = '1';

  const name = document.createElement('a');
  name.className = 'recipe-row__title';
  name.href = `/pages/inventory-form.html?id=${encodeURIComponent(item.id)}`;
  name.textContent = item.name;

  const meta = document.createElement('div');
  meta.className = 'recipe-row__meta';
  const quantity = document.createElement('span');
  quantity.className = 'inventory-qty';
  quantity.textContent = quantityLabel(item);
  meta.append(quantity);
  if (item.minimumQuantity > 0) {
    meta.append(metaText(`min ${item.minimumQuantity}${item.unit ? ` ${item.unit}` : ''}`));
  }
  meta.append(metaText(LOCATION_LABELS[item.location] ?? item.location));
  if (item.expiresAt) {
    meta.append(metaText(`Expires ${formatDate(item.expiresAt)}`));
  }
  if (STOCK_LABELS[item.status]) {
    meta.append(
      chip(
        STOCK_LABELS[item.status],
        `stock-chip stock-chip--${item.status === 'OUT_OF_STOCK' ? 'out' : 'low'}`,
      ),
    );
  }
  if (EXPIRY_LABELS[item.expiryStatus]) {
    meta.append(
      chip(
        EXPIRY_LABELS[item.expiryStatus],
        `stock-chip stock-chip--${item.expiryStatus === 'EXPIRED' ? 'expired' : 'expiring'}`,
      ),
    );
  }
  info.append(name, meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const consume = document.createElement('button');
  consume.type = 'button';
  consume.className = 'icon-btn';
  consume.setAttribute('aria-label', `Use or waste ${item.name}`);
  consume.innerHTML = icon('minus');
  consume.addEventListener('click', () => openStockModal(item, 'consume'));

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'icon-btn';
  add.setAttribute('aria-label', `Add stock to ${item.name}`);
  add.innerHTML = icon('plus');
  add.addEventListener('click', () => openStockModal(item, 'add'));

  const edit = document.createElement('a');
  edit.className = 'icon-btn';
  edit.href = `/pages/inventory-form.html?id=${encodeURIComponent(item.id)}`;
  edit.setAttribute('aria-label', `Edit ${item.name}`);
  edit.innerHTML = icon('pencil');

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', `Delete ${item.name}`);
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Delete item',
      message: `Delete “${item.name}” and its stock history?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteInventoryItem(item.id);
      toast('Item deleted.', { type: 'success' });
      await load();
    } catch (error) {
      toast(describeError(error), { type: 'error' });
    }
  });

  actions.append(consume, add, edit, remove);
  row.append(info, actions);
  return row;
}

function renderItems(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const item of items) {
    list.append(buildRow(item));
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

function isFiltered() {
  return Boolean(state.search || state.category || state.location || state.stock || state.expiry);
}

async function load() {
  listEl.innerHTML = loadingState('Loading inventory…');
  pagerEl.hidden = true;
  setStatus(statusEl, '');

  try {
    const data = await listInventory(state);
    if (!data.items.length) {
      if (isFiltered()) {
        listEl.innerHTML = emptyState({
          iconName: 'package',
          title: 'No items match',
          text: 'Try different filters.',
          action: '<button type="button" class="btn btn--secondary btn--small" data-clear-filters>Clear filters</button>',
        });
        listEl.querySelector('[data-clear-filters]').addEventListener('click', resetFilters);
        setStatus(statusEl, 'No matching items.');
      } else {
        listEl.innerHTML = emptyState({
          iconName: 'package',
          title: 'Nothing in inventory yet',
          text: 'Add what is at home — or move bought shopping items across.',
          action: '<a class="btn btn--primary btn--small" href="/pages/inventory-form.html">Add an item</a>',
        });
      }
      return;
    }
    renderItems(data.items);
    renderPagination(data);
    setStatus(
      statusEl,
      `${data.total} ${data.total === 1 ? 'item' : 'items'}${isFiltered() ? ' match' : ''}`,
    );
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to track inventory.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function openStockModal(item, mode) {
  const isConsume = mode === 'consume';
  const body = document.createElement('form');
  body.className = 'form';
  body.innerHTML = `
    <div class="form-grid">
      <div class="field">
        <label for="stock-quantity">Quantity</label>
        <input type="number" id="stock-quantity" min="0.001" step="0.001" required>
      </div>
      <div class="field">
        <label for="stock-note">Note</label>
        <input type="text" id="stock-note" maxlength="300" placeholder="Optional">
      </div>
    </div>
    ${
      isConsume
        ? `<label class="field--check"><input type="checkbox" id="stock-waste"> Wasted (do not count as used)</label>`
        : ''
    }
    <p class="form-status" data-status role="status" aria-live="polite"></p>`;

  openModal({
    title: isConsume ? `Use ${item.name}` : `Add stock — ${item.name}`,
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: isConsume ? 'Record' : 'Add',
        variant: 'primary',
        onClick: async ({ close }) => {
          const status = body.querySelector('[data-status]');
          const quantity = body.querySelector('#stock-quantity').value;
          const note = body.querySelector('#stock-note').value.trim() || null;
          if (!quantity) {
            setStatus(status, 'Enter a quantity.', 'error');
            return;
          }
          try {
            if (isConsume) {
              const wasted = body.querySelector('#stock-waste').checked;
              if (wasted) {
                await wasteInventoryItem(item.id, { quantity, note });
              } else {
                await consumeInventoryItem(item.id, { quantity, note });
              }
            } else {
              await addInventoryStock(item.id, { quantity, note });
            }
            close();
            toast(isConsume ? 'Stock updated.' : 'Stock added.', { type: 'success' });
            await load();
          } catch (error) {
            setStatus(status, describeError(error), 'error');
          }
        },
      },
    ],
  });
}

function readFilters() {
  state.search = filtersForm.search.value.trim();
  state.category = filtersForm.category.value;
  state.location = filtersForm.location.value;
  state.stock = filtersForm.stock.value;
  state.expiry = filtersForm.expiry.value;
}

function resetFilters() {
  filtersForm.reset();
  readFilters();
  state.page = 1;
  load();
}

function wireEvents() {
  filtersForm.addEventListener('submit', (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    load();
  });
  for (const name of ['category', 'location', 'stock', 'expiry']) {
    filtersForm[name].addEventListener('change', () => {
      readFilters();
      state.page = 1;
      load();
    });
  }
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
