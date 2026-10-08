import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { loadingState, errorState, emptyState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { confirmDialog, openModal } from '../components/modal.js';
import { describeError, setStatus, setBusy } from '../utils/forms.js';
import {
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  adjustInventoryItem,
  listInventoryTransactions,
} from '../api/inventory.js';

/* Inventory item form — quantity changes go through the adjust flow so the
   transaction ledger stays complete (the field is read-only when editing). */

const itemId = new URLSearchParams(window.location.search).get('id');
const isEdit = Boolean(itemId);

const form = document.getElementById('inventory-form');
const statusEl = document.getElementById('inventory-form-status');
const noticeEl = document.querySelector('[data-form-notice]');
const deleteButton = document.querySelector('[data-delete]');
const adjustButton = document.querySelector('[data-adjust]');
const createQuantityField = document.querySelector('[data-create-quantity]');
const editQuantityField = document.querySelector('[data-edit-quantity]');
const currentQuantityEl = document.querySelector('[data-current-quantity]');
const historySection = document.querySelector('[data-history]');
const historyList = document.querySelector('[data-history-list]');

const TRANSACTION_LABELS = {
  PURCHASE: 'Added',
  CONSUME: 'Used',
  WASTE: 'Wasted',
  ADJUST: 'Adjusted',
};

function formatDelta(delta) {
  return delta > 0 ? `+${delta}` : String(delta);
}

function buildPayload() {
  const payload = {
    name: form.name.value.trim(),
    unit: form.unit.value.trim() || null,
    category: form.category.value,
    location: form.location.value,
    expiresAt: form.expiresAt.value || null,
    minimumQuantity: form.minimumQuantity.value || '0',
    notes: form.notes.value.trim() || null,
  };
  if (!isEdit) {
    payload.quantity = form.quantity.value || '0';
  }
  return payload;
}

function renderHistory(transactions) {
  if (!transactions.length) {
    historyList.innerHTML = emptyState({
      iconName: 'package',
      title: 'No stock changes yet',
      text: 'Add stock, use or adjust the item and every step is recorded here.',
    });
    return;
  }
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const transaction of transactions) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const info = document.createElement('div');
    info.className = 'item-info';
    const label = document.createElement('span');
    label.textContent = `${TRANSACTION_LABELS[transaction.type] ?? transaction.type} ${formatDelta(transaction.quantityDelta)}`;
    const meta = document.createElement('small');
    const parts = [`Now ${transaction.quantityAfter}`];
    if (transaction.note) {
      parts.push(transaction.note);
    }
    if (transaction.createdBy) {
      parts.push(transaction.createdBy.name);
    }
    parts.push(new Date(transaction.createdAt).toLocaleDateString());
    meta.textContent = parts.join(' · ');
    info.append(label, meta);
    row.append(info);
    list.append(row);
  }
  historyList.replaceChildren(list);
}

async function loadHistory() {
  historySection.hidden = false;
  historyList.innerHTML = loadingState('Loading history…');
  try {
    const data = await listInventoryTransactions(itemId, { limit: 20 });
    renderHistory(data.items);
  } catch (error) {
    historyList.innerHTML = errorState(describeError(error));
  }
}

function openAdjustModal(item) {
  const body = document.createElement('form');
  body.className = 'form';
  body.innerHTML = `
    <div class="form-grid">
      <div class="field">
        <label for="adjust-quantity">New quantity</label>
        <input type="number" id="adjust-quantity" min="0" step="0.001" value="${item.quantity}" required>
      </div>
      <div class="field">
        <label for="adjust-note">Note</label>
        <input type="text" id="adjust-note" maxlength="300" placeholder="Why is it changing?">
      </div>
    </div>
    <p class="form-status" data-status role="status" aria-live="polite"></p>`;

  openModal({
    title: `Adjust ${item.name}`,
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: 'Set quantity',
        variant: 'primary',
        onClick: async ({ close }) => {
          const status = body.querySelector('[data-status]');
          try {
            await adjustInventoryItem(item.id, {
              quantity: body.querySelector('#adjust-quantity').value,
              note: body.querySelector('#adjust-note').value.trim() || null,
            });
            close();
            toast('Quantity adjusted.', { type: 'success' });
            const refreshed = await getInventoryItem(item.id);
            prefillQuantity(refreshed.item);
            await loadHistory();
          } catch (error) {
            setStatus(status, describeError(error), 'error');
          }
        },
      },
    ],
  });
}

function prefillQuantity(item) {
  currentQuantityEl.textContent = item.unit
    ? `${item.quantity} ${item.unit}`
    : String(item.quantity);
}

function prefill(item) {
  form.name.value = item.name;
  form.unit.value = item.unit ?? '';
  form.category.value = item.category;
  form.location.value = item.location;
  form.expiresAt.value = item.expiresAt ?? '';
  form.minimumQuantity.value = String(item.minimumQuantity);
  form.notes.value = item.notes ?? '';
  prefillQuantity(item);

  createQuantityField.hidden = true;
  editQuantityField.hidden = false;
  deleteButton.hidden = false;
  adjustButton.hidden = false;

  document.querySelector('[data-form-title]').textContent = 'Edit inventory item';
  document.querySelector('[data-form-subtitle]').textContent =
    'Stock changes are recorded in the history below.';
  document.body.dataset.pageTitle = 'Edit inventory item';
  document.title = 'Edit inventory item — Housewife Diary';
}

function showNotice(html) {
  noticeEl.innerHTML = html;
}

function wireEvents() {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(form, true);
    setStatus(statusEl, isEdit ? 'Saving changes…' : 'Saving item…', 'muted');
    try {
      if (isEdit) {
        await updateInventoryItem(itemId, buildPayload());
      } else {
        await createInventoryItem(buildPayload());
      }
      toast(isEdit ? 'Item updated.' : 'Item added.', { type: 'success' });
      window.location.assign('/pages/inventory.html');
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    } finally {
      setBusy(form, false);
    }
  });

  adjustButton.addEventListener('click', async () => {
    try {
      const result = await getInventoryItem(itemId);
      openAdjustModal(result.item);
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    }
  });

  deleteButton.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Delete item',
      message: 'Delete this item and its stock history?',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteInventoryItem(itemId);
      toast('Item deleted.', { type: 'success' });
      window.location.assign('/pages/inventory.html');
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    }
  });
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  wireEvents();

  if (isEdit) {
    try {
      const result = await getInventoryItem(itemId);
      prefill(result.item);
      await loadHistory();
    } catch (error) {
      if (error?.status === 404) {
        showNotice(`
          <div class="alert alert--danger" role="alert">
            This item does not exist or is not in this household.
            <a href="/pages/inventory.html">Back to inventory</a>
          </div>`);
        form.querySelector('[type="submit"]').disabled = true;
        return;
      }
      if (error?.status === 403) {
        showNotice(`
          <div class="alert alert--warning" role="alert">
            <strong>No active household.</strong> Create or join a household to track inventory.
            <a href="/pages/household.html">Set up a household</a>
          </div>`);
        form.querySelector('[type="submit"]').disabled = true;
        return;
      }
      setStatus(statusEl, describeError(error), 'error');
    }
  }
}

init().catch((error) => {
  setStatus(statusEl, describeError(error), 'error');
});
