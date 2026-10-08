import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatMoney } from '../utils/money.js';
import { formatDate, todayString } from '../utils/dates.js';
import { buildField, buildSelect, buildInput, buildChip } from '../utils/finance-ui.js';
import {
  getFinanceMeta,
  listBills,
  createBill,
  updateBill,
  payBill,
  cancelBill,
} from '../api/finance.js';

/* Bills — reminders with a cash-basis payment that creates the expense. */

const STATUS_VARIANTS = {
  UPCOMING: 'info',
  DUE: 'warning',
  OVERDUE: 'expense',
  PAID: 'income',
  CANCELLED: 'muted',
};

const listEl = document.querySelector('[data-bills]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const statusEl = document.getElementById('bills-status');
const filtersForm = document.getElementById('bill-filters');
const state = { page: 1, limit: 20, status: 'ALL', categoryId: '', search: '' };
let meta = null;

function expenseCategories() {
  return meta.categories.filter((category) => category.type === 'EXPENSE');
}

function openBillModal(bill = null) {
  const body = document.createElement('form');
  body.className = 'form';
  const nameInput = buildInput({ id: 'bill-name', value: bill?.name ?? '', maxlength: '120', placeholder: 'Electricity' });
  const amountInput = buildInput({ type: 'number', id: 'bill-amount', value: bill?.amount ?? '', step: '0.01', min: '0.01' });
  const currencySelect = buildSelect(
    meta.currencies.map((code) => ({ value: code, label: code })),
    { value: bill?.currency ?? meta.defaultCurrency, id: 'bill-currency' },
  );
  const dueInput = buildInput({ type: 'date', id: 'bill-due', value: bill?.dueDate ?? todayString() });
  const categorySelect = buildSelect(
    expenseCategories().map((category) => ({
      value: category.id,
      label: category.scope === 'HOUSEHOLD' ? `${category.name} (household)` : category.name,
    })),
    { value: bill?.category?.id ?? '', id: 'bill-category' },
  );
  const accountSelect = buildSelect(
    meta.accounts.map((account) => ({
      value: account.id,
      label: `${account.name} (${account.currency})`,
    })),
    { value: bill?.account?.id ?? '', includeEmpty: 'No account', id: 'bill-account' },
  );
  const recurringLabel = document.createElement('label');
  recurringLabel.className = 'field--check';
  recurringLabel.htmlFor = 'bill-recurring';
  const recurringInput = document.createElement('input');
  recurringInput.type = 'checkbox';
  recurringInput.id = 'bill-recurring';
  recurringInput.checked = bill?.recurring ?? false;
  recurringLabel.append(recurringInput, document.createTextNode(' Repeats regularly'));
  const notesInput = buildInput({ id: 'bill-notes', value: bill?.notes ?? '', maxlength: '1000', placeholder: 'Optional' });

  body.append(
    buildField('Name', nameInput),
    buildField('Amount', amountInput),
    buildField('Currency', currencySelect),
    buildField('Due date', dueInput),
    buildField('Category', categorySelect),
    buildField('Account', accountSelect),
    buildField('', recurringLabel),
    buildField('Notes', notesInput),
  );
  const status = document.createElement('p');
  status.className = 'form-status';
  status.setAttribute('role', 'status');
  body.append(status);

  openModal({
    title: bill ? 'Edit bill' : 'New bill',
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: bill ? 'Save' : 'Create',
        variant: 'primary',
        onClick: async ({ close }) => {
          const payload = {
            name: nameInput.value.trim(),
            amount: amountInput.value,
            currency: currencySelect.value,
            dueDate: dueInput.value,
            categoryId: categorySelect.value,
            accountId: accountSelect.value || null,
            recurring: recurringInput.checked,
            notes: notesInput.value.trim() || null,
          };
          if (!payload.name) {
            setStatus(status, 'Give the bill a name.', 'error');
            return;
          }
          try {
            if (bill) {
              await updateBill(bill.id, payload);
            } else {
              await createBill(payload);
            }
            close();
            toast(bill ? 'Bill updated.' : 'Bill created.', { type: 'success' });
            await load();
          } catch (error) {
            setStatus(status, describeError(error), 'error');
          }
        },
      },
    ],
  });
  nameInput.focus();
}

function openPayModal(bill) {
  const body = document.createElement('form');
  body.className = 'form';
  const amountInput = buildInput({ type: 'number', id: 'pay-amount', value: bill.amount, step: '0.01', min: '0.01' });
  const dateInput = buildInput({ type: 'date', id: 'pay-date', value: todayString() });
  const accountSelect = buildSelect(
    meta.accounts
      .filter((account) => account.currency === bill.currency)
      .map((account) => ({ value: account.id, label: `${account.name} (${account.currency})` })),
    { value: bill.account?.id ?? '', includeEmpty: 'No account', id: 'pay-account' },
  );
  const merchantInput = buildInput({ id: 'pay-merchant', value: '', maxlength: '120', placeholder: bill.name });
  body.append(
    buildField('Amount', amountInput),
    buildField('Payment date', dateInput),
    buildField('Account', accountSelect),
    buildField('Merchant / payee', merchantInput),
  );
  const status = document.createElement('p');
  status.className = 'form-status';
  status.setAttribute('role', 'status');
  body.append(status);

  openModal({
    title: `Pay ${bill.name}`,
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: 'Record payment',
        variant: 'primary',
        onClick: async ({ close }) => {
          try {
            await payBill(bill.id, {
              amount: amountInput.value,
              transactionDate: dateInput.value,
              accountId: accountSelect.value || null,
              merchant: merchantInput.value.trim() || null,
            });
            close();
            toast('Payment recorded.', { type: 'success' });
            await load();
          } catch (error) {
            setStatus(status, describeError(error), 'error');
          }
        },
      },
    ],
  });
}

function buildBillRow(bill) {
  const actions = [];
  if (bill.status === 'UPCOMING' || bill.status === 'DUE' || bill.status === 'OVERDUE') {
    const pay = document.createElement('button');
    pay.type = 'button';
    pay.className = 'btn btn--secondary btn--small';
    pay.textContent = 'Pay';
    pay.addEventListener('click', () => openPayModal(bill));
    actions.push(pay);

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'icon-btn';
    edit.setAttribute('aria-label', `Edit ${bill.name}`);
    edit.innerHTML = icon('pencil');
    edit.addEventListener('click', () => openBillModal(bill));
    actions.push(edit);

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'icon-btn';
    cancel.setAttribute('aria-label', `Cancel ${bill.name}`);
    cancel.innerHTML = icon('x');
    cancel.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Cancel bill',
        message: `Cancel “${bill.name}”?`,
        confirmLabel: 'Cancel bill',
        danger: true,
      });
      if (!confirmed) {
        return;
      }
      try {
        await cancelBill(bill.id);
        toast('Bill cancelled.', { type: 'success' });
        await load();
      } catch (error) {
        toast(describeError(error), { type: 'error' });
      }
    });
    actions.push(cancel);
  }

  const row = document.createElement('div');
  row.className = 'item-row finance-row';
  const info = document.createElement('div');
  info.className = 'item-info';
  info.style.flex = '1';
  const name = document.createElement('span');
  name.className = 'recipe-row__title';
  name.textContent = bill.name;
  const metaLine = document.createElement('div');
  metaLine.className = 'recipe-row__meta';
  function metaText(text) {
    const span = document.createElement('span');
    span.className = 'meta-text';
    span.textContent = text;
    metaLine.append(span);
  }
  metaText(`Due ${formatDate(bill.dueDate)}`);
  if (bill.category) {
    metaText(bill.category.name);
  }
  if (bill.account) {
    metaText(bill.account.name);
  }
  if (bill.recurring) {
    metaText('Repeats');
  }
  if (bill.status === 'PAID' && bill.paidAt) {
    metaText(`Paid ${formatDate(bill.paidAt.slice(0, 10))}`);
  }
  metaLine.append(buildChip(bill.status, STATUS_VARIANTS[bill.status] ?? 'muted'));
  info.append(name, metaLine);

  const amount = document.createElement('span');
  amount.className = `amount finance-row__amount${bill.status === 'CANCELLED' ? ' amount--transfer' : ''}`;
  amount.textContent = formatMoney(bill.amount, bill.currency);

  const actionsEl = document.createElement('div');
  actionsEl.className = 'item-actions';
  for (const action of actions) {
    actionsEl.append(action);
  }

  row.append(info, amount, actionsEl);
  return row;
}

function render(bills) {
  if (!bills.length) {
    listEl.innerHTML = emptyState({
      iconName: 'calendar',
      title: 'No bills here',
      text: 'Add the bills you need to remember and mark them paid when settled.',
      action: '<button type="button" class="btn btn--primary btn--small" data-empty-new>New bill</button>',
    });
    listEl.querySelector('[data-empty-new]').addEventListener('click', () => openBillModal());
    return;
  }
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const bill of bills) {
    list.append(buildBillRow(bill));
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
  listEl.innerHTML = loadingState('Loading bills…');
  pagerEl.hidden = true;
  setStatus(statusEl, '');
  try {
    const data = await listBills({
      status: state.status,
      categoryId: state.categoryId,
      search: state.search,
      page: state.page,
      limit: state.limit,
    });
    render(data.items);
    renderPagination(data);
    setStatus(statusEl, data.total ? `${data.total} ${data.total === 1 ? 'bill' : 'bills'}` : '');
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to keep bills.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function readFilters() {
  state.status = filtersForm.status.value;
  state.categoryId = filtersForm.categoryId.value;
  state.search = filtersForm.search.value.trim();
}

function wireEvents() {
  filtersForm.addEventListener('submit', (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    load();
  });
  filtersForm.status.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  filtersForm.categoryId.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  document.querySelector('[data-reset]').addEventListener('click', () => {
    filtersForm.reset();
    readFilters();
    state.page = 1;
    load();
  });
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
  try {
    meta = await getFinanceMeta();
  } catch (error) {
    listEl.innerHTML = errorState(describeError(error));
    return;
  }
  const newButton = document.querySelector('[data-new-bill]');
  newButton.addEventListener('click', () => openBillModal());
  newButton.disabled = false;
  wireEvents();
  for (const category of expenseCategories()) {
    filtersForm.categoryId.append(new Option(category.name, category.id));
  }
  await load();
}

init().catch((error) => {
  listEl.innerHTML = errorState(describeError(error));
});
