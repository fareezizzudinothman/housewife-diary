import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import { buildField, buildSelect, buildInput, buildRow, buildChip } from '../utils/finance-ui.js';
import {
  listCategories,
  createCategory,
  updateCategory,
  archiveCategory,
} from '../api/finance.js';

/* Categories — global catalog (read-only) plus household-owned rows. */

const ICON_OPTIONS = [
  'wallet',
  'cart',
  'utensils',
  'home',
  'map-pin',
  'book',
  'package',
  'sparkles',
  'users',
  'lock',
  'calendar',
  'star',
  'pencil',
  'plus',
  'grid',
];

const listEl = document.querySelector('[data-categories]');
const statusEl = document.getElementById('categories-status');
const typeFilter = document.querySelector('[data-type-filter]');
const archivedToggle = document.querySelector('[data-include-archived]');

function openCategoryModal(category = null) {
  const body = document.createElement('form');
  body.className = 'form';
  const nameInput = buildInput({ id: 'category-name', value: category?.name ?? '', maxlength: '80', placeholder: 'Kids activities' });
  const typeSelect = buildSelect(
    [
      { value: 'EXPENSE', label: 'Expense' },
      { value: 'INCOME', label: 'Income' },
    ],
    { value: category?.type ?? 'EXPENSE', id: 'category-type' },
  );
  typeSelect.disabled = Boolean(category);
  const iconSelect = buildSelect(
    [{ value: '', label: 'No icon' }, ...ICON_OPTIONS.map((name) => ({ value: name, label: name }))],
    { value: category?.icon ?? '', id: 'category-icon' },
  );
  body.append(buildField('Name', nameInput), buildField('Type', typeSelect), buildField('Icon', iconSelect));
  const status = document.createElement('p');
  status.className = 'form-status';
  status.setAttribute('role', 'status');
  body.append(status);

  openModal({
    title: category ? 'Edit category' : 'New category',
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: category ? 'Save' : 'Create',
        variant: 'primary',
        onClick: async ({ close }) => {
          const name = nameInput.value.trim();
          if (!name) {
            setStatus(status, 'Give the category a name.', 'error');
            return;
          }
          try {
            if (category) {
              await updateCategory(category.id, { name, icon: iconSelect.value || null });
            } else {
              await createCategory({ name, type: typeSelect.value, icon: iconSelect.value || null });
            }
            close();
            toast(category ? 'Category updated.' : 'Category created.', { type: 'success' });
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

function buildCategoryRow(category) {
  const actions = [];
  if (category.scope === 'HOUSEHOLD') {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'icon-btn';
    edit.setAttribute('aria-label', `Edit ${category.name}`);
    edit.innerHTML = icon('pencil');
    edit.addEventListener('click', () => openCategoryModal(category));
    actions.push(edit);

    const archive = document.createElement('button');
    archive.type = 'button';
    archive.className = 'icon-btn';
    archive.setAttribute('aria-label', `Archive ${category.name}`);
    archive.innerHTML = icon('archive');
    archive.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Archive category',
        message: `Archive “${category.name}”? Past transactions keep their category.`,
        confirmLabel: 'Archive',
      });
      if (!confirmed) {
        return;
      }
      try {
        await archiveCategory(category.id);
        toast('Category archived.', { type: 'success' });
        await load();
      } catch (error) {
        toast(describeError(error), { type: 'error' });
      }
    });
    actions.push(archive);
  }

  const row = buildRow({
    title: category.name,
    metaParts: [`${category.transactionCount ?? 0} transactions`],
    actions,
  });
  const chips = document.createElement('div');
  chips.className = 'recipe-row__meta';
  chips.append(buildChip(category.type === 'INCOME' ? 'Income' : 'Expense', category.type === 'INCOME' ? 'income' : 'expense'));
  chips.append(
    buildChip(category.scope === 'HOUSEHOLD' ? 'Household' : 'Built-in', 'muted'),
  );
  if (!category.active) {
    chips.append(buildChip('Archived', 'warning'));
  }
  row.querySelector('.item-info').append(chips);
  return row;
}

function render(categories) {
  if (!categories.length) {
    listEl.innerHTML = emptyState({
      iconName: 'grid',
      title: 'No categories match',
      text: 'Adjust the filters or add a household category.',
    });
    return;
  }
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const category of categories) {
    list.append(buildCategoryRow(category));
  }
  listEl.replaceChildren(list);
}

async function load() {
  listEl.innerHTML = loadingState('Loading categories…');
  setStatus(statusEl, '');
  try {
    const data = await listCategories({
      type: typeFilter.value || undefined,
      includeArchived: archivedToggle.checked,
      limit: 100,
    });
    render(data.items);
    setStatus(statusEl, `${data.total} ${data.total === 1 ? 'category' : 'categories'}`);
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
  const newButton = document.querySelector('[data-new-category]');
  newButton.addEventListener('click', () => openCategoryModal());
  newButton.disabled = false;
  typeFilter.addEventListener('change', load);
  archivedToggle.addEventListener('change', load);
  await load();
}

init().catch((error) => {
  listEl.innerHTML = errorState(describeError(error));
});
