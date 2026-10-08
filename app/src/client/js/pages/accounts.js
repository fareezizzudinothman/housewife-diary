import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatMoney } from '../utils/money.js';
import { buildField, buildSelect, buildInput, buildRow } from '../utils/finance-ui.js';
import {
  getFinanceMeta,
  listAccounts,
  createAccount,
  updateAccount,
  archiveAccount,
} from '../api/finance.js';

/* Accounts — derived balances with modal create/edit and archive. */

const ACCOUNT_TYPES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK', label: 'Bank' },
  { value: 'CREDIT_CARD', label: 'Credit card' },
  { value: 'E_WALLET', label: 'E-wallet' },
  { value: 'OTHER', label: 'Other' },
];

const listEl = document.querySelector('[data-accounts]');
const statusEl = document.getElementById('accounts-status');
const archivedToggle = document.querySelector('[data-include-archived]');
let meta = null;

function typeLabel(type) {
  return ACCOUNT_TYPES.find((entry) => entry.value === type)?.label ?? type;
}

function openAccountModal(account = null) {
  const body = document.createElement('form');
  body.className = 'form';
  const nameInput = buildInput({ id: 'account-name', value: account?.name ?? '', maxlength: '80', placeholder: 'Maybank Savings' });
  const typeSelect = buildSelect(ACCOUNT_TYPES, { value: account?.type ?? 'CASH', id: 'account-type' });
  const currencySelect = buildSelect(
    meta.currencies.map((code) => ({ value: code, label: code })),
    { value: account?.currency ?? meta.defaultCurrency, id: 'account-currency' },
  );
  const openingInput = buildInput({
    type: 'number',
    id: 'account-opening',
    value: account?.openingBalance ?? '',
    step: '0.01',
    placeholder: '0.00',
  });
  body.append(
    buildField('Name', nameInput),
    buildField('Type', typeSelect),
    buildField('Currency', currencySelect),
    buildField('Opening balance', openingInput),
  );
  const status = document.createElement('p');
  status.className = 'form-status';
  status.setAttribute('role', 'status');
  body.append(status);

  openModal({
    title: account ? 'Edit account' : 'New account',
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: account ? 'Save' : 'Create',
        variant: 'primary',
        onClick: async ({ close }) => {
          const payload = {
            name: nameInput.value.trim(),
            type: typeSelect.value,
            currency: currencySelect.value,
            openingBalance: openingInput.value === '' ? '0.00' : openingInput.value,
          };
          if (!payload.name) {
            setStatus(status, 'Give the account a name.', 'error');
            return;
          }
          try {
            if (account) {
              await updateAccount(account.id, payload);
            } else {
              await createAccount(payload);
            }
            close();
            toast(account ? 'Account updated.' : 'Account created.', { type: 'success' });
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

function buildAccountRow(account) {
  const actions = [];
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'icon-btn';
  edit.setAttribute('aria-label', `Edit ${account.name}`);
  edit.innerHTML = icon('pencil');
  edit.addEventListener('click', () => openAccountModal(account));
  actions.push(edit);

  if (account.active) {
    const archive = document.createElement('button');
    archive.type = 'button';
    archive.className = 'icon-btn';
    archive.setAttribute('aria-label', `Archive ${account.name}`);
    archive.innerHTML = icon('archive');
    archive.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Archive account',
        message: `Archive “${account.name}”? Past transactions stay in history.`,
        confirmLabel: 'Archive',
      });
      if (!confirmed) {
        return;
      }
      try {
        await archiveAccount(account.id);
        toast('Account archived.', { type: 'success' });
        await load();
      } catch (error) {
        toast(describeError(error), { type: 'error' });
      }
    });
    actions.push(archive);
  }

  const metaParts = [typeLabel(account.type), account.currency];
  if (account.openingBalance !== '0.00') {
    metaParts.push(`Opening ${formatMoney(account.openingBalance, account.currency)}`);
  }
  if (!account.active) {
    metaParts.push('Archived');
  }

  return buildRow({
    title: account.name,
    metaParts,
    amount: formatMoney(account.balance, account.currency),
    amountClass: account.balance.startsWith('-') ? 'amount amount--expense' : 'amount',
    actions,
  });
}

function render(accounts) {
  if (!accounts.length) {
    listEl.innerHTML = emptyState({
      iconName: 'credit-card',
      title: 'No accounts yet',
      text: 'Add the cash, bank or wallet accounts you use.',
      action: '<button type="button" class="btn btn--primary btn--small" data-empty-new>New account</button>',
    });
    listEl.querySelector('[data-empty-new]').addEventListener('click', () => openAccountModal());
    return;
  }
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const account of accounts) {
    list.append(buildAccountRow(account));
  }
  listEl.replaceChildren(list);
}

async function load() {
  listEl.innerHTML = loadingState('Loading accounts…');
  setStatus(statusEl, '');
  try {
    const data = await listAccounts({ includeArchived: archivedToggle.checked, limit: 50 });
    render(data.items);
    setStatus(statusEl, `${data.total} ${data.total === 1 ? 'account' : 'accounts'}`);
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
  const newButton = document.querySelector('[data-new-account]');
  newButton.addEventListener('click', () => openAccountModal());
  newButton.disabled = false;
  archivedToggle.addEventListener('change', load);
  await load();
}

init().catch((error) => {
  listEl.innerHTML = errorState(describeError(error));
});
