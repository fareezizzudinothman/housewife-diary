import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatMoney } from '../utils/money.js';
import { formatMonthYear } from '../utils/dates.js';
import { buildField, buildSelect, buildInput, buildChip } from '../utils/finance-ui.js';
import {
  getFinanceMeta,
  listBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
} from '../api/finance.js';

/* Budgets — monthly ceilings with derived spend and usage. */

const listEl = document.querySelector('[data-budgets]');
const statusEl = document.getElementById('budgets-status');
const monthFilter = document.querySelector('[data-month-filter]');
const allMonths = document.querySelector('[data-all-months]');
let meta = null;

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function openBudgetModal(budget = null) {
  const body = document.createElement('form');
  body.className = 'form';
  const expenseCategories = meta.categories.filter((category) => category.type === 'EXPENSE');
  const categorySelect = buildSelect(
    expenseCategories.map((category) => ({
      value: category.id,
      label: category.scope === 'HOUSEHOLD' ? `${category.name} (household)` : category.name,
    })),
    { value: budget?.category?.id ?? '', id: 'budget-category' },
  );
  const amountInput = buildInput({
    type: 'number',
    id: 'budget-amount',
    value: budget?.amount ?? '',
    step: '0.01',
    min: '0.01',
    placeholder: '600.00',
  });
  const currencySelect = buildSelect(
    meta.currencies.map((code) => ({ value: code, label: code })),
    { value: budget?.currency ?? meta.defaultCurrency, id: 'budget-currency' },
  );
  const monthInput = buildInput({
    type: 'month',
    id: 'budget-month',
    value: budget
      ? `${budget.year}-${String(budget.month).padStart(2, '0')}`
      : currentMonthValue(),
  });
  const notesInput = buildInput({ id: 'budget-notes', value: budget?.notes ?? '', maxlength: '500', placeholder: 'Optional' });

  body.append(
    buildField('Category', categorySelect),
    buildField('Amount', amountInput),
    buildField('Currency', currencySelect),
    buildField('Month', monthInput),
    buildField('Notes', notesInput),
  );
  if (budget) {
    categorySelect.disabled = true;
    currencySelect.disabled = true;
    monthInput.disabled = true;
  }
  const status = document.createElement('p');
  status.className = 'form-status';
  status.setAttribute('role', 'status');
  body.append(status);

  openModal({
    title: budget ? 'Edit budget' : 'New budget',
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: budget ? 'Save' : 'Create',
        variant: 'primary',
        onClick: async ({ close }) => {
          const status = body.querySelector('.form-status');
          try {
            if (budget) {
              await updateBudget(budget.id, {
                amount: amountInput.value,
                notes: notesInput.value.trim() || null,
              });
            } else {
              const [year, month] = monthInput.value.split('-').map(Number);
              await createBudget({
                categoryId: categorySelect.value,
                amount: amountInput.value,
                currency: currencySelect.value,
                year,
                month,
                notes: notesInput.value.trim() || null,
              });
            }
            close();
            toast(budget ? 'Budget updated.' : 'Budget created.', { type: 'success' });
            await load();
          } catch (error) {
            setStatus(status, describeError(error), 'error');
          }
        },
      },
    ],
  });
}

function buildBudgetRow(budget) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.style.flexDirection = 'column';
  row.style.alignItems = 'stretch';

  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.alignItems = 'center';
  head.style.gap = '0.75rem';

  const info = document.createElement('div');
  info.className = 'item-info';
  info.style.flex = '1';
  const name = document.createElement('span');
  name.className = 'recipe-row__title';
  name.textContent = budget.category?.name ?? 'Category';
  const metaLine = document.createElement('div');
  metaLine.className = 'recipe-row__meta';
  function metaText(text) {
    const span = document.createElement('span');
    span.className = 'meta-text';
    span.textContent = text;
    metaLine.append(span);
  }
  metaText(formatMonthYear(budget.year, budget.month - 1));
  metaText(`${formatMoney(budget.spent, budget.currency)} of ${formatMoney(budget.amount, budget.currency)}`);
  if (budget.overBudget) {
    metaLine.append(buildChip('Over budget', 'danger'));
  } else if (budget.percentUsed !== null && budget.percentUsed >= 80) {
    metaLine.append(buildChip(`${budget.percentUsed}% used`, 'warning'));
  }
  info.append(name, metaLine);

  const remaining = document.createElement('span');
  remaining.className = `${overBudgetClass(budget)} finance-row__amount`.trim();
  remaining.title = 'Remaining';
  remaining.textContent = formatMoney(budget.remaining, budget.currency);

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'icon-btn';
  edit.setAttribute('aria-label', `Edit budget for ${budget.category?.name ?? 'category'}`);
  edit.innerHTML = icon('pencil');
  edit.addEventListener('click', () => openBudgetModal(budget));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', `Delete budget for ${budget.category?.name ?? 'category'}`);
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Delete budget',
      message: 'Delete this budget? Transactions are not affected.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteBudget(budget.id);
      toast('Budget deleted.', { type: 'success' });
      await load();
    } catch (error) {
      toast(describeError(error), { type: 'error' });
    }
  });
  actions.append(edit, remove);

  head.append(info, remaining, actions);

  const progress = document.createElement('div');
  progress.className = 'progress';
  progress.style.marginTop = '0.6rem';
  const fill = document.createElement('div');
  const percent = Math.min(100, budget.percentUsed ?? 0);
  fill.className = `progress__fill${budget.overBudget ? ' progress__fill--danger' : percent >= 80 ? ' progress__fill--warning' : ''}`;
  fill.style.width = `${percent}%`;
  progress.append(fill);

  row.append(head, progress);
  return row;
}

function overBudgetClass(budget) {
  if (budget.remaining.startsWith('-')) {
    return 'amount amount--expense';
  }
  return 'amount';
}

function render(budgets) {
  if (!budgets.length) {
    listEl.innerHTML = emptyState({
      iconName: 'target',
      title: 'No budgets here',
      text: 'Set a monthly ceiling for a category to track your spending.',
      action: '<button type="button" class="btn btn--primary btn--small" data-empty-new>New budget</button>',
    });
    listEl.querySelector('[data-empty-new]').addEventListener('click', () => openBudgetModal());
    return;
  }
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const budget of budgets) {
    list.append(buildBudgetRow(budget));
  }
  listEl.replaceChildren(list);
}

async function load() {
  listEl.innerHTML = loadingState('Loading budgets…');
  setStatus(statusEl, '');
  try {
    const params = { limit: 100 };
    if (!allMonths.checked && monthFilter.value) {
      const [year, month] = monthFilter.value.split('-').map(Number);
      params.year = year;
      params.month = month;
    }
    const data = await listBudgets(params);
    render(data.items);
    setStatus(
      statusEl,
      data.total ? `${data.total} ${data.total === 1 ? 'budget' : 'budgets'}` : '',
    );
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to keep budgets.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  monthFilter.value = currentMonthValue();
  try {
    meta = await getFinanceMeta();
  } catch (error) {
    listEl.innerHTML = errorState(describeError(error));
    return;
  }
  const newButton = document.querySelector('[data-new-budget]');
  newButton.addEventListener('click', () => openBudgetModal());
  newButton.disabled = false;
  monthFilter.addEventListener('change', load);
  allMonths.addEventListener('change', load);
  await load();
}

init().catch((error) => {
  listEl.innerHTML = errorState(describeError(error));
});
