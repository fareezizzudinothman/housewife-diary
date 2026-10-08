import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { describeError, setStatus, setBusy } from '../utils/forms.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { todayString } from '../utils/dates.js';
import {
  getFinanceMeta,
  getTransaction,
  createTransaction,
  updateTransaction,
  voidTransaction,
  uploadReceipt,
  deleteReceipt,
  receiptUrl,
} from '../api/finance.js';

/* Transaction form — create mode builds income, expense and transfer rows;
   edit mode keeps money and account fields immutable (void and re-enter) and
   manages the optional receipt. */

const params = new URLSearchParams(window.location.search);
const transactionId = params.get('id');
const presetType = params.get('type');
const isEdit = Boolean(transactionId);

const form = document.getElementById('transaction-form');
const statusEl = document.getElementById('transaction-status');
const noticeEl = document.querySelector('[data-form-notice]');
const categoryField = document.querySelector('[data-category-field]');
const accountField = document.querySelector('[data-account-field]');
const accountLabel = document.querySelector('[data-account-label]');
const counterField = document.querySelector('[data-counter-account-field]');
const receiptSection = document.querySelector('[data-receipt-section]');
const receiptCurrent = document.querySelector('[data-receipt-current]');
const voidButton = document.querySelector('[data-void]');
const receiptInput = document.getElementById('tx-receipt-file');

let meta = null;
let current = null;

function categoriesForType(type) {
  return meta.categories.filter((category) => category.type === type);
}

function fillCategories() {
  const type = form.type.value;
  const select = form.categoryId;
  const previous = select.value;
  select.replaceChildren();
  if (type === 'TRANSFER') {
    return;
  }
  for (const category of categoriesForType(type)) {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.scope === 'HOUSEHOLD' ? `${category.name} (household)` : category.name;
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === previous)) {
    select.value = previous;
  }
}

function fillAccounts() {
  const build = (select, { includeEmpty = false, selected = '' } = {}) => {
    select.replaceChildren();
    if (includeEmpty) {
      select.append(new Option('No account', ''));
    }
    for (const account of meta.accounts) {
      select.append(new Option(`${account.name} (${account.currency})`, account.id));
    }
    if (selected && [...select.options].some((option) => option.value === selected)) {
      select.value = selected;
    }
  };
  build(form.accountId, { includeEmpty: true, selected: current?.account?.id ?? '' });
  build(form.counterAccountId, { selected: current?.counterAccount?.id ?? '' });
}

function syncTypeFields() {
  const isTransfer = form.type.value === 'TRANSFER';
  categoryField.hidden = isTransfer;
  counterField.hidden = !isTransfer;
  accountLabel.textContent = isTransfer ? 'From account' : 'Account';
  fillCategories();
}

function readPayload() {
  const type = form.type.value;
  const payload = {
    type,
    amount: form.amount.value,
    currency: form.currency.value,
    transactionDate: form.transactionDate.value,
    description: form.description.value.trim() || null,
    merchant: form.merchant.value.trim() || null,
    notes: form.notes.value.trim() || null,
  };
  if (type === 'TRANSFER') {
    payload.accountId = form.accountId.value || null;
    payload.counterAccountId = form.counterAccountId.value || null;
  } else {
    payload.categoryId = form.categoryId.value || null;
    payload.accountId = form.accountId.value || null;
  }
  return payload;
}

function renderReceipt(receipt) {
  receiptCurrent.replaceChildren();
  if (!receipt) {
    const line = document.createElement('p');
    line.className = 'meta-text';
    line.textContent = 'No receipt attached.';
    receiptCurrent.append(line);
    return;
  }
  const row = document.createElement('div');
  row.className = 'item-row';
  const info = document.createElement('div');
  info.className = 'item-info';
  const name = document.createElement('span');
  name.textContent = receipt.originalName;
  const metaLine = document.createElement('small');
  metaLine.className = 'meta-text';
  metaLine.textContent = `${receipt.mimeType} · ${(receipt.sizeBytes / 1024).toFixed(0)} KB`;
  info.append(name, metaLine);
  const actions = document.createElement('div');
  actions.className = 'item-actions';
  const view = document.createElement('a');
  view.className = 'btn btn--ghost btn--small';
  view.href = receiptUrl(transactionId);
  view.target = '_blank';
  view.rel = 'noopener';
  view.textContent = 'View';
  const download = document.createElement('a');
  download.className = 'btn btn--ghost btn--small';
  download.href = receiptUrl(transactionId, { download: true });
  download.textContent = 'Download';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn--danger btn--small';
  remove.textContent = 'Remove';
  remove.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Remove receipt',
      message: 'Remove the receipt from this transaction?',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteReceipt(transactionId);
      current.receipt = null;
      renderReceipt(null);
      toast('Receipt removed.', { type: 'success' });
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    }
  });
  actions.append(view, download, remove);
  row.append(info, actions);
  receiptCurrent.append(row);
}

function prefill(transaction) {
  current = transaction;
  form.type.value = transaction.type;
  form.amount.value = transaction.amount;
  form.currency.value = transaction.currency;
  form.transactionDate.value = transaction.transactionDate;
  form.description.value = transaction.description ?? '';
  form.merchant.value = transaction.merchant ?? '';
  form.notes.value = transaction.notes ?? '';
  fillAccounts();
  fillCategories();
  if (transaction.category) {
    form.categoryId.value = transaction.category.id;
  }
  if (transaction.account) {
    form.accountId.value = transaction.account.id;
  }
  if (transaction.counterAccount) {
    form.counterAccountId.value = transaction.counterAccount.id;
  }

  // Money, type and account fields are immutable once posted.
  form.type.disabled = true;
  form.amount.disabled = true;
  form.currency.disabled = true;
  form.accountId.disabled = true;
  form.counterAccountId.disabled = true;

  document.querySelector('[data-form-title]').textContent = 'Edit transaction';
  document.querySelector('[data-form-subtitle]').textContent =
    'Amounts and accounts are fixed; void and re-enter to correct them.';
  document.body.dataset.pageTitle = 'Edit transaction';
  document.title = 'Edit transaction — Housewife Diary';

  receiptSection.hidden = false;
  renderReceipt(transaction.receipt);
  voidButton.hidden = transaction.status === 'VOIDED';
  if (transaction.status === 'VOIDED') {
    noticeEl.innerHTML = `
      <div class="alert alert--warning" role="alert">
        <strong>This transaction is voided.</strong> It stays in history but no longer counts
        towards balances or reports.
      </div>`;
  }
  syncCounterForEdit(transaction);
}

function syncCounterForEdit(transaction) {
  if (transaction.type === 'TRANSFER') {
    categoryField.hidden = true;
    counterField.hidden = false;
    accountLabel.textContent = 'From account';
  }
}

function wireEvents() {
  form.type.addEventListener('change', syncTypeFields);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(form, true);
    setStatus(statusEl, isEdit ? 'Saving changes…' : 'Saving transaction…', 'muted');
    try {
      const payload = readPayload();
      if (isEdit) {
        const editable = {
          transactionDate: payload.transactionDate,
          description: payload.description,
          merchant: payload.merchant,
          notes: payload.notes,
        };
        if (current.type !== 'TRANSFER') {
          editable.categoryId = payload.categoryId;
        }
        await updateTransaction(transactionId, editable);
      } else {
        await createTransaction(payload);
      }
      toast(isEdit ? 'Transaction updated.' : 'Transaction saved.', { type: 'success' });
      window.location.assign('/pages/finance.html');
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    } finally {
      setBusy(form, false);
    }
  });

  voidButton.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Void transaction',
      message: 'Void this transaction? It stays in history but is excluded from reports.',
      confirmLabel: 'Void',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await voidTransaction(transactionId, {});
      toast('Transaction voided.', { type: 'success' });
      window.location.assign('/pages/finance.html');
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    }
  });

  receiptInput.addEventListener('change', async () => {
    const file = receiptInput.files?.[0];
    if (!file || !isEdit) {
      return;
    }
    setStatus(statusEl, 'Uploading receipt…', 'muted');
    try {
      const result = await uploadReceipt(transactionId, file);
      current.receipt = result.receipt;
      renderReceipt(result.receipt);
      receiptInput.value = '';
      setStatus(statusEl, '');
      toast('Receipt attached.', { type: 'success' });
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

  try {
    meta = await getFinanceMeta();
  } catch (error) {
    setStatus(statusEl, describeError(error), 'error');
    return;
  }

  form.currency.replaceChildren();
  for (const code of meta.currencies) {
    form.currency.append(new Option(code, code));
  }
  form.currency.value = meta.defaultCurrency;
  form.transactionDate.value = meta.today || todayString();
  if (!isEdit && ['INCOME', 'EXPENSE', 'TRANSFER'].includes(presetType)) {
    form.type.value = presetType;
  }

  wireEvents();
  syncTypeFields();

  if (isEdit) {
    try {
      const result = await getTransaction(transactionId);
      prefill(result.transaction);
    } catch (error) {
      if (error?.status === 404) {
        noticeEl.innerHTML = `
          <div class="alert alert--danger" role="alert">
            This transaction does not exist or is not in this household.
            <a href="/pages/finance.html">Back to finance</a>
          </div>`;
        form.querySelector('[type="submit"]').disabled = true;
        return;
      }
      if (error?.status === 403) {
        noticeEl.innerHTML = `
          <div class="alert alert--warning" role="alert">
            <strong>No active household.</strong> Create or join a household to keep finances.
            <a href="/pages/household.html">Set up a household</a>
          </div>`;
        form.querySelector('[type="submit"]').disabled = true;
        return;
      }
      setStatus(statusEl, describeError(error), 'error');
    }
  } else {
    fillAccounts();
    syncTypeFields();
  }
  form.querySelector('[type="submit"]').disabled = false;
}

init().catch((error) => {
  setStatus(statusEl, describeError(error), 'error');
});
