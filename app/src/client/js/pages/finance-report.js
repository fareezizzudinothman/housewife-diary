import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatMoney } from '../utils/money.js';
import { formatMonthYear, formatDate } from '../utils/dates.js';
import { buildMoneyTile, buildChip } from '../utils/finance-ui.js';
import { getMonthlyReport } from '../api/finance.js';

/* Monthly report — totals, category breakdown, budgets, bills and balances. */

const filtersForm = document.getElementById('report-filters');
const summaryEl = document.querySelector('[data-report-summary]');
const expenseEl = document.querySelector('[data-expense-categories]');
const budgetsEl = document.querySelector('[data-budgets]');
const billsEl = document.querySelector('[data-bills]');
const accountsEl = document.querySelector('[data-accounts]');
const titleEl = document.querySelector('[data-report-title]');
const statusEl = document.getElementById('report-status');
let currencyInitialised = false;

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function buildBar(name, valueText, percent, variant = '') {
  const wrapper = document.createElement('div');
  const head = document.createElement('div');
  head.className = 'report-bar__head';
  const label = document.createElement('span');
  label.className = 'report-bar__name';
  label.textContent = name;
  const value = document.createElement('span');
  value.className = 'report-bar__value';
  value.textContent = valueText;
  head.append(label, value);

  const progress = document.createElement('div');
  progress.className = 'progress';
  const fill = document.createElement('div');
  fill.className = `progress__fill${variant ? ` progress__fill--${variant}` : ''}`;
  fill.style.width = `${Math.min(100, Math.max(0, percent ?? 0))}%`;
  progress.append(fill);

  wrapper.append(head, progress);
  return wrapper;
}

function renderSummary(report) {
  summaryEl.replaceChildren(
    buildMoneyTile('Income', formatMoney(report.income, report.currency), `${report.incomeByCategory.length} sources`),
    buildMoneyTile('Expenses', formatMoney(report.expenses, report.currency), `${report.transactionCount} transactions`),
    buildMoneyTile(
      'Net',
      formatMoney(report.net, report.currency),
      report.net.startsWith('-') ? 'Spending exceeded income' : 'Cash flow this month',
      report.net.startsWith('-') ? 'amount--expense' : 'amount--income',
    ),
  );
}

function renderExpenseCategories(report) {
  expenseEl.replaceChildren();
  if (!report.expenseByCategory.length) {
    expenseEl.innerHTML = '<p class="muted">No expenses recorded this month.</p>';
    return;
  }
  for (const row of report.expenseByCategory) {
    expenseEl.append(
      buildBar(
        row.name ?? 'Uncategorised',
        `${formatMoney(row.total, report.currency)} · ${row.percent ?? 0}%`,
        row.percent ?? 0,
      ),
    );
  }
}

function renderBudgets(report) {
  budgetsEl.replaceChildren();
  const subtitle = document.querySelector('[data-budget-subtitle]');
  if (!report.budgets.length) {
    budgetsEl.innerHTML = '<p class="muted">No budgets for this month.</p>';
    subtitle.textContent = 'No budgets configured';
    return;
  }
  subtitle.textContent = `${report.budgetTotals.percentUsed ?? 0}% of ${formatMoney(report.budgetTotals.amount, report.currency)} used`;
  for (const budget of report.budgets) {
    budgetsEl.append(
      buildBar(
        budget.category?.name ?? 'Category',
        `${formatMoney(budget.spent, report.currency)} of ${formatMoney(budget.amount, report.currency)}`,
        budget.percentUsed ?? 0,
        budget.overBudget ? 'danger' : (budget.percentUsed ?? 0) >= 80 ? 'warning' : '',
      ),
    );
  }
}

function renderBills(report) {
  billsEl.replaceChildren();
  const subtitle = document.querySelector('[data-bills-subtitle]');
  subtitle.textContent = `${report.bills.overdue} overdue · ${report.bills.upcoming} unpaid`;
  if (!report.upcomingBills.length) {
    billsEl.innerHTML = '<p class="muted">No upcoming bills.</p>';
    return;
  }
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const bill of report.upcomingBills) {
    const row = document.createElement('div');
    row.className = 'item-row finance-row';
    const info = document.createElement('div');
    info.className = 'item-info';
    const name = document.createElement('span');
    name.className = 'recipe-row__title';
    name.textContent = bill.name;
    const meta = document.createElement('div');
    meta.className = 'recipe-row__meta';
    const due = document.createElement('span');
    due.className = 'meta-text';
    due.textContent = `Due ${formatDate(bill.dueDate)}`;
    meta.append(due);
    info.append(name, meta);
    const amount = document.createElement('span');
    amount.className = 'amount';
    amount.textContent = formatMoney(bill.amount, bill.currency);
    const chip = bill.status === 'OVERDUE' ? buildChip('Overdue', 'expense') : buildChip(bill.status, 'info');
    row.append(info, amount, chip);
    list.append(row);
  }
  billsEl.append(list);
}

function renderAccounts(report) {
  accountsEl.replaceChildren();
  const subtitle = document.querySelector('[data-accounts-subtitle]');
  subtitle.textContent = `${report.accounts.length} ${report.accounts.length === 1 ? 'account' : 'accounts'} in ${report.currency}`;
  if (!report.accounts.length) {
    accountsEl.innerHTML = '<p class="muted">No accounts in this currency.</p>';
    return;
  }
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const account of report.accounts) {
    const row = document.createElement('div');
    row.className = 'item-row finance-row';
    const info = document.createElement('div');
    info.className = 'item-info';
    const name = document.createElement('span');
    name.className = 'recipe-row__title';
    name.textContent = account.name;
    const meta = document.createElement('div');
    meta.className = 'recipe-row__meta';
    const type = document.createElement('span');
    type.className = 'meta-text';
    type.textContent = account.type.replace('_', ' ').toLowerCase();
    meta.append(type);
    if (!account.active) {
      meta.append(buildChip('Archived', 'muted'));
    }
    info.append(name, meta);
    const balance = document.createElement('span');
    balance.className = `amount${account.balance.startsWith('-') ? ' amount--expense' : ''}`;
    balance.textContent = formatMoney(account.balance, report.currency);
    row.append(info, balance);
    list.append(row);
  }
  accountsEl.append(list);
}

async function load() {
  const month = filtersForm.month.value || currentMonthValue();
  const [year, monthNumber] = month.split('-').map(Number);
  statusEl.textContent = '';
  try {
    const report = await getMonthlyReport({
      year,
      month: monthNumber,
      currency: filtersForm.currency.value || undefined,
    });
    filtersForm.currency.value = report.currency;
    titleEl.textContent = formatMonthYear(report.year, report.month - 1);
    document.body.dataset.pageTitle = titleEl.textContent;
    renderSummary(report);
    renderExpenseCategories(report);
    renderBudgets(report);
    renderBills(report);
    renderAccounts(report);
    if (!currencyInitialised) {
      filtersForm.currency.replaceChildren();
      for (const code of [report.currency, ...report.availableCurrencies.filter((item) => item !== report.currency)]) {
        filtersForm.currency.append(new Option(code, code));
      }
      filtersForm.currency.value = report.currency;
      currencyInitialised = true;
    }
    setStatus(statusEl, '');
  } catch (error) {
    if (error?.status === 403) {
      expenseEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to see reports.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    summaryEl.replaceChildren();
    setStatus(statusEl, describeError(error), 'error');
  }
}

async function init() {
  filtersForm.month.value = currentMonthValue();
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  filtersForm.addEventListener('submit', (event) => {
    event.preventDefault();
    load();
  });
  filtersForm.currency.addEventListener('change', load);
  filtersForm.month.addEventListener('change', load);
  await load();
}

init().catch((error) => {
  setStatus(statusEl, describeError(error), 'error');
});
