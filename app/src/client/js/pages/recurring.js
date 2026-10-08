import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatSignedMoney, amountClass } from '../utils/money.js';
import { formatDate } from '../utils/dates.js';
import { buildField, buildSelect, buildInput, buildChip } from '../utils/finance-ui.js';
import {
  getFinanceMeta,
  listRecurring,
  createRecurring,
  updateRecurring,
  pauseRecurring,
  resumeRecurring,
} from '../api/finance.js';

/* Recurring rules — create/pause/resume; the ledger fills in as dates pass. */

const FREQUENCY_LABELS = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly' };
const listEl = document.querySelector('[data-recurring]');
const statusEl = document.getElementById('recurring-status');
const activeFilter = document.querySelector('[data-active-filter]');
const typeFilter = document.querySelector('[data-type-filter]');
let meta = null;

function categoriesForType(type) {
  return meta.categories.filter((category) => category.type === type);
}

function openRuleModal(rule = null) {
  const body = document.createElement('form');
  body.className = 'form';
  const typeSelect = buildSelect(
    [
      { value: 'EXPENSE', label: 'Expense' },
      { value: 'INCOME', label: 'Income' },
    ],
    { value: rule?.type ?? 'EXPENSE', id: 'recurring-type' },
  );
  const amountInput = buildInput({ type: 'number', id: 'recurring-amount', value: rule?.amount ?? '', step: '0.01', min: '0.01' });
  const currencySelect = buildSelect(
    meta.currencies.map((code) => ({ value: code, label: code })),
    { value: rule?.currency ?? meta.defaultCurrency, id: 'recurring-currency' },
  );
  const categorySelect = buildSelect([], { value: rule?.category?.id ?? '', id: 'recurring-category' });
  const fillCategories = () => {
    categorySelect.replaceChildren();
    for (const category of categoriesForType(typeSelect.value)) {
      categorySelect.append(new Option(category.name, category.id));
    }
    if (rule?.category?.id) {
      categorySelect.value = rule.category.id;
    }
  };
  fillCategories();
  typeSelect.addEventListener('change', fillCategories);
  const accountSelect = buildSelect(
    meta.accounts.map((account) => ({ value: account.id, label: `${account.name} (${account.currency})` })),
    { value: rule?.account?.id ?? '', includeEmpty: 'No account', id: 'recurring-account' },
  );
  const descriptionInput = buildInput({ id: 'recurring-description', value: rule?.description ?? '', maxlength: '200', placeholder: 'Rent' });
  const merchantInput = buildInput({ id: 'recurring-merchant', value: rule?.merchant ?? '', maxlength: '120', placeholder: 'Optional' });
  const frequencySelect = buildSelect(
    [
      { value: 'DAILY', label: 'Daily' },
      { value: 'WEEKLY', label: 'Weekly' },
      { value: 'MONTHLY', label: 'Monthly' },
      { value: 'YEARLY', label: 'Yearly' },
    ],
    { value: rule?.frequency ?? 'MONTHLY', id: 'recurring-frequency' },
  );
  const intervalInput = buildInput({ type: 'number', id: 'recurring-interval', value: rule?.interval ?? 1, min: '1', max: '99' });
  const startInput = buildInput({ type: 'date', id: 'recurring-start', value: rule?.startDate ?? '' });
  const endInput = buildInput({ type: 'date', id: 'recurring-end', value: rule?.endDate ?? '' });
  const notesInput = buildInput({ id: 'recurring-notes', value: rule?.notes ?? '', maxlength: '1000', placeholder: 'Optional' });

  body.append(
    buildField('Type', typeSelect),
    buildField('Amount', amountInput),
    buildField('Currency', currencySelect),
    buildField('Category', categorySelect),
    buildField('Account', accountSelect),
    buildField('Description', descriptionInput),
    buildField('Merchant / payee', merchantInput),
    buildField('Frequency', frequencySelect),
    buildField('Every (intervals)', intervalInput),
    buildField('Start date', startInput),
    buildField('End date (optional)', endInput),
    buildField('Notes', notesInput),
  );
  if (rule) {
    typeSelect.disabled = true;
    currencySelect.disabled = true;
    frequencySelect.disabled = true;
    startInput.disabled = true;
  }
  const status = document.createElement('p');
  status.className = 'form-status';
  status.setAttribute('role', 'status');
  body.append(status);

  openModal({
    title: rule ? 'Edit rule' : 'New recurring rule',
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: rule ? 'Save' : 'Create',
        variant: 'primary',
        onClick: async ({ close }) => {
          try {
            if (rule) {
              await updateRecurring(rule.id, {
                amount: amountInput.value,
                categoryId: categorySelect.value,
                accountId: accountSelect.value || null,
                description: descriptionInput.value.trim() || null,
                merchant: merchantInput.value.trim() || null,
                interval: intervalInput.value,
                endDate: endInput.value || null,
                notes: notesInput.value.trim() || null,
              });
            } else {
              await createRecurring({
                type: typeSelect.value,
                amount: amountInput.value,
                currency: currencySelect.value,
                categoryId: categorySelect.value,
                accountId: accountSelect.value || null,
                description: descriptionInput.value.trim() || null,
                merchant: merchantInput.value.trim() || null,
                frequency: frequencySelect.value,
                interval: intervalInput.value,
                startDate: startInput.value,
                endDate: endInput.value || null,
                notes: notesInput.value.trim() || null,
              });
            }
            close();
            toast(rule ? 'Rule updated.' : 'Rule created.', { type: 'success' });
            await list();
          } catch (error) {
            setStatus(status, describeError(error), 'error');
          }
        },
      },
    ],
  });
}

function buildRuleRow(rule) {
  const row = document.createElement('div');
  row.className = 'item-row finance-row';

  const info = document.createElement('div');
  info.className = 'item-info';
  info.style.flex = '1';
  const title = document.createElement('span');
  title.className = 'recipe-row__title';
  title.textContent = rule.description ?? rule.category?.name ?? 'Recurring rule';
  const metaLine = document.createElement('div');
  metaLine.className = 'recipe-row__meta';
  function metaText(text) {
    const span = document.createElement('span');
    span.className = 'meta-text';
    span.textContent = text;
    metaLine.append(span);
  }
  metaText(`${FREQUENCY_LABELS[rule.frequency] ?? rule.frequency} · every ${rule.interval}`);
  metaText(`Started ${formatDate(rule.startDate)}`);
  if (rule.nextOccurrence) {
    metaText(`Next ${formatDate(rule.nextOccurrence)}`);
  } else {
    metaText('Completed');
  }
  metaText(`${rule.generatedCount} posted`);
  if (rule.account) {
    metaText(rule.account.name);
  }
  metaLine.append(buildChip(rule.active ? 'Active' : 'Paused', rule.active ? 'income' : 'muted'));
  info.append(title, metaLine);

  const amount = document.createElement('span');
  amount.className = `${amountClass(rule.type)} finance-row__amount`;
  amount.textContent = formatSignedMoney(rule.amount, rule.currency, rule.type);

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'icon-btn';
  edit.setAttribute('aria-label', `Edit ${rule.description ?? 'rule'}`);
  edit.innerHTML = icon('pencil');
  edit.addEventListener('click', () => openRuleModal(rule));
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'icon-btn';
  toggle.setAttribute('aria-label', rule.active ? `Pause ${rule.description ?? 'rule'}` : `Resume ${rule.description ?? 'rule'}`);
  toggle.innerHTML = icon(rule.active ? 'minus' : 'refresh');
  toggle.addEventListener('click', async () => {
    try {
      if (rule.active) {
        await pauseRecurring(rule.id);
        toast('Rule paused.', { type: 'success' });
      } else {
        await resumeRecurring(rule.id);
        toast('Rule resumed.', { type: 'success' });
      }
      await list();
    } catch (error) {
      toast(describeError(error), { type: 'error' });
    }
  });
  actions.append(edit, toggle);

  row.append(info, amount, actions);
  return row;
}

function render(rules) {
  if (!rules.length) {
    listEl.innerHTML = emptyState({
      iconName: 'repeat',
      title: 'No recurring rules',
      text: 'Add salary, rent or subscriptions so they post automatically when due.',
      action: '<button type="button" class="btn btn--primary btn--small" data-empty-new>New rule</button>',
    });
    listEl.querySelector('[data-empty-new]').addEventListener('click', () => openRuleModal());
    return;
  }
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const rule of rules) {
    list.append(buildRuleRow(rule));
  }
  listEl.replaceChildren(list);
}

async function list() {
  listEl.innerHTML = loadingState('Loading rules…');
  setStatus(statusEl, '');
  try {
    const data = await listRecurring({
      active: activeFilter.value,
      type: typeFilter.value || undefined,
      limit: 50,
    });
    render(data.items);
    setStatus(statusEl, data.total ? `${data.total} ${data.total === 1 ? 'rule' : 'rules'}` : '');
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
  const newButton = document.querySelector('[data-new-rule]');
  newButton.addEventListener('click', () => openRuleModal());
  newButton.disabled = false;
  activeFilter.addEventListener('change', list);
  typeFilter.addEventListener('change', list);
  await list();
}

init().catch((error) => {
  listEl.innerHTML = errorState(describeError(error));
});
