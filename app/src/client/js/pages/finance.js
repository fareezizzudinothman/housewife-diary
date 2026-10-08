import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatDate } from '../utils/dates.js';
import { formatSignedMoney, amountClass, formatMoney } from '../utils/money.js';
import {
  getFinanceMeta,
  getMonthlyReport,
  listTransactions,
} from '../api/finance.js';

/* Finance overview — month summary plus the compact transaction ledger.
   Money is rendered from API strings; no browser arithmetic on amounts. */

const state = {
  month: new Date().toISOString().slice(0, 7),
  currency: '',
  type: '',
  categoryId: '',
  accountId: '',
  search: '',
  page: 1,
  limit: 20,
};

const summaryEl = document.querySelector('[data-summary]');
const listEl = document.querySelector('[data-transactions]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const statusEl = document.getElementById('finance-status');
const filtersForm = document.getElementById('finance-filters');
let meta = null;

function monthBounds(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function buildTile(label, value, metaText, valueClass = '') {
  const tile = document.createElement('div');
  tile.className = 'money-tile';
  const labelEl = document.createElement('span');
  labelEl.className = 'money-tile__label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = `money-tile__value ${valueClass}`.trim();
  valueEl.textContent = value;
  const metaEl = document.createElement('span');
  metaEl.className = 'money-tile__meta';
  metaEl.textContent = metaText;
  tile.append(labelEl, valueEl, metaEl);
  return tile;
}

function renderSummary(report) {
  summaryEl.replaceChildren();
  summaryEl.append(
    buildTile(
      'Income',
      formatMoney(report.income, report.currency),
      `${report.incomeByCategory.length} ${report.incomeByCategory.length === 1 ? 'source' : 'sources'}`,
    ),
    buildTile(
      'Expenses',
      formatMoney(report.expenses, report.currency),
      `${report.expenseByCategory.length} ${report.expenseByCategory.length === 1 ? 'category' : 'categories'}`,
    ),
    buildTile(
      'Net',
      formatMoney(report.net, report.currency),
      report.net.startsWith('-') ? 'Spending exceeded income' : 'Cash flow this month',
      report.net.startsWith('-') ? 'amount--expense' : 'amount--income',
    ),
  );
  if (report.budgets.length > 0) {
    summaryEl.append(
      buildTile(
        'Budgets used',
        report.budgetTotals.percentUsed === null ? '—' : `${report.budgetTotals.percentUsed}%`,
        `${formatMoney(report.budgetTotals.spent, report.currency)} of ${formatMoney(report.budgetTotals.amount, report.currency)}`,
      ),
    );
  }
}

function categoryName(transaction) {
  if (transaction.category) {
    return transaction.category.name;
  }
  return null;
}

function buildRow(transaction) {
  const row = document.createElement('div');
  row.className = 'item-row finance-row';
  if (transaction.status === 'VOIDED') {
    row.classList.add('shop-item--purchased');
  }

  const info = document.createElement('div');
  info.className = 'item-info';
  info.style.flex = '1';

  const title = document.createElement('a');
  title.className = 'recipe-row__title';
  title.href = `/pages/transaction-form.html?id=${encodeURIComponent(transaction.id)}`;
  title.textContent =
    transaction.description ?? transaction.merchant ?? categoryName(transaction) ?? 'Transaction';

  const metaEl = document.createElement('div');
  metaEl.className = 'recipe-row__meta';
  const parts = [formatDate(transaction.transactionDate)];
  if (transaction.merchant && transaction.description) {
    parts.push(transaction.merchant);
  }
  const category = categoryName(transaction);
  if (category) {
    parts.push(category);
  }
  if (transaction.type === 'TRANSFER' && transaction.counterAccount) {
    parts.push(`${transaction.account?.name ?? '—'} → ${transaction.counterAccount.name}`);
  } else if (transaction.account) {
    parts.push(transaction.account.name);
  }
  if (transaction.sourceType === 'BILL') {
    parts.push('Bill payment');
  } else if (transaction.sourceType === 'RECURRING') {
    parts.push('Recurring');
  }
  if (transaction.hasReceipt) {
    parts.push('Receipt');
  }
  if (transaction.status === 'VOIDED') {
    parts.push('Voided');
  }
  for (const part of parts) {
    const span = document.createElement('span');
    span.className = 'meta-text';
    span.textContent = part;
    metaEl.append(span);
  }
  info.append(title, metaEl);

  const amount = document.createElement('span');
  amount.className = `${amountClass(transaction.type)} finance-row__amount`;
  amount.textContent =
    transaction.type === 'TRANSFER'
      ? formatMoney(transaction.amount, transaction.currency)
      : formatSignedMoney(transaction.amount, transaction.currency, transaction.type);

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  const edit = document.createElement('a');
  edit.className = 'icon-btn';
  edit.href = `/pages/transaction-form.html?id=${encodeURIComponent(transaction.id)}`;
  edit.setAttribute('aria-label', `Edit transaction`);
  edit.innerHTML = icon('pencil');
  actions.append(edit);

  row.append(info, amount, actions);
  return row;
}

function renderTransactions(items) {
  if (!items.length) {
    listEl.innerHTML = emptyState({
      iconName: 'wallet',
      title: 'No transactions this month',
      text: 'Record income and expenses to build your ledger.',
      action:
        '<a class="btn btn--primary btn--small" href="/pages/transaction-form.html">Add transaction</a>',
    });
    return;
  }
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const transaction of items) {
    list.append(buildRow(transaction));
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

function populateSelects() {
  const currencySelect = filtersForm.currency;
  currencySelect.replaceChildren();
  for (const code of meta.currencies) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = code;
    currencySelect.append(option);
  }
  currencySelect.value = state.currency || meta.defaultCurrency;

  const categorySelect = filtersForm.categoryId;
  categorySelect.replaceChildren(new Option('All categories', ''));
  for (const category of meta.categories) {
    categorySelect.append(new Option(`${category.name} · ${category.type === 'INCOME' ? 'Income' : 'Expense'}`, category.id));
  }

  const accountSelect = filtersForm.accountId;
  accountSelect.replaceChildren(new Option('All accounts', ''));
  for (const account of meta.accounts) {
    accountSelect.append(new Option(`${account.name} (${account.currency})`, account.id));
  }
}

async function loadSummary() {
  const [year, month] = state.month.split('-').map(Number);
  const report = await getMonthlyReport({
    year,
    month,
    currency: state.currency || undefined,
  });
  state.currency = report.currency;
  filtersForm.currency.value = report.currency;
  renderSummary(report);
}

async function loadTransactions() {
  listEl.innerHTML = loadingState('Loading transactions…');
  pagerEl.hidden = true;
  const bounds = monthBounds(state.month);
  const data = await listTransactions({
    from: bounds.from,
    to: bounds.to,
    type: state.type,
    categoryId: state.categoryId,
    accountId: state.accountId,
    search: state.search,
    page: state.page,
    limit: state.limit,
  });
  renderTransactions(data.items);
  renderPagination(data);
  const count = data.total;
  setStatus(statusEl, count ? `${count} ${count === 1 ? 'transaction' : 'transactions'}` : '');
}

async function load() {
  setStatus(statusEl, '');
  try {
    await Promise.all([loadSummary(), loadTransactions()]);
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to keep finances.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function readFilters() {
  state.month = filtersForm.month.value || state.month;
  state.currency = filtersForm.currency.value;
  state.type = filtersForm.type.value;
  state.categoryId = filtersForm.categoryId.value;
  state.accountId = filtersForm.accountId.value;
  state.search = filtersForm.search.value.trim();
}

function resetFilters() {
  state.type = '';
  state.categoryId = '';
  state.accountId = '';
  state.search = '';
  filtersForm.reset();
  filtersForm.month.value = state.month;
  filtersForm.currency.value = state.currency;
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
  for (const name of ['month', 'currency', 'type', 'categoryId', 'accountId']) {
    filtersForm[name].addEventListener('change', () => {
      readFilters();
      state.page = 1;
      load();
    });
  }
  document.querySelector('[data-reset]').addEventListener('click', resetFilters);
  document.querySelector('[data-page-prev]').addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    loadTransactions();
  });
  document.querySelector('[data-page-next]').addEventListener('click', () => {
    state.page += 1;
    loadTransactions();
  });
}

async function init() {
  filtersForm.month.value = state.month;
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
  state.currency = meta.defaultCurrency;
  populateSelects();
  wireEvents();
  await load();
}

init().catch((error) => {
  listEl.innerHTML = errorState(describeError(error));
});
