import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { confirmDialog, openModal } from '../components/modal.js';
import { describeError, setStatus, setBusy } from '../utils/forms.js';
import {
  addDays,
  mondayIndex,
  toDateString,
} from '../utils/dates.js';
import {
  getShoppingList,
  updateShoppingList,
  deleteShoppingList,
  listShoppingItems,
  createShoppingItem,
  updateShoppingItem,
  deleteShoppingItem,
  addRecipeToShoppingList,
  previewMealsToShopping,
  addMealsToShoppingList,
  shoppingItemToInventory,
} from '../api/shopping.js';
import { listRecipes } from '../api/recipes.js';

/* Shopping list detail — check items off, add from recipes or the meal
   plan, and move bought items into inventory explicitly. */

const listId = new URLSearchParams(window.location.search).get('id');
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

const state = { page: 1, limit: 100, list: null };
let recipeOptions = null;

const nameEl = document.querySelector('[data-list-name]');
const subtitleEl = document.querySelector('[data-list-subtitle]');
const itemsEl = document.querySelector('[data-items]');
const statusEl = document.getElementById('list-status');
const noticeEl = document.querySelector('[data-list-notice]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const addForm = document.getElementById('item-add');
const archiveButton = document.querySelector('[data-archive]');

function quantityLabel(item) {
  if (item.quantity === null && !item.unit) {
    return null;
  }
  const quantity = item.quantity === null ? '' : String(item.quantity);
  return `${quantity} ${item.unit ?? ''}`.trim();
}

function chip(text, className = 'tag-chip') {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

async function togglePurchased(item, checkbox) {
  checkbox.disabled = true;
  try {
    await updateShoppingItem(listId, item.id, { purchased: !item.purchased });
    await loadItems();
    await loadListHeader();
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    toast(describeError(error), { type: 'error' });
  } finally {
    checkbox.disabled = false;
  }
}

function buildItemRow(item) {
  const row = document.createElement('div');
  row.className = 'item-row shop-item';
  if (item.purchased) {
    row.classList.add('shop-item--purchased');
  }

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'shop-item__check';
  checkbox.checked = item.purchased;
  checkbox.setAttribute('aria-label', `Mark “${item.name}” ${item.purchased ? 'not bought' : 'bought'}`);
  checkbox.addEventListener('change', () => togglePurchased(item, checkbox));

  const info = document.createElement('div');
  info.className = 'item-info';
  info.style.flex = '1';

  const name = document.createElement('span');
  name.className = 'shop-item__name';
  name.textContent = item.name;

  const meta = document.createElement('div');
  meta.className = 'shop-item__meta';
  const quantity = quantityLabel(item);
  if (quantity) {
    meta.append(chip(quantity, 'meta-text'));
  }
  meta.append(chip(CATEGORY_LABELS[item.category] ?? item.category));
  if (item.recipe) {
    meta.append(chip(`From ${item.recipe.title}`, 'meta-text'));
  }
  if (item.notes) {
    const notes = document.createElement('span');
    notes.className = 'meta-text';
    notes.textContent = item.notes;
    meta.append(notes);
  }

  info.append(name, meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'icon-btn';
  edit.setAttribute('aria-label', `Edit ${item.name}`);
  edit.innerHTML = icon('pencil');
  edit.addEventListener('click', () => openEditItemModal(item));

  const toInventory = document.createElement('button');
  toInventory.type = 'button';
  toInventory.className = 'icon-btn';
  toInventory.setAttribute('aria-label', `Add ${item.name} to inventory`);
  toInventory.innerHTML = icon('package');
  toInventory.addEventListener('click', () => openInventoryModal(item));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', `Delete ${item.name}`);
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', async () => {
    try {
      await deleteShoppingItem(listId, item.id);
      await loadItems();
      await loadListHeader();
    } catch (error) {
      toast(describeError(error), { type: 'error' });
    }
  });

  actions.append(edit, toInventory, remove);
  row.append(checkbox, info, actions);
  return row;
}

function renderItems(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const item of items) {
    list.append(buildItemRow(item));
  }
  itemsEl.replaceChildren(list);
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

async function loadListHeader() {
  const result = await getShoppingList(listId);
  state.list = result.list;
  nameEl.textContent = result.list.name;
  subtitleEl.textContent =
    result.list.itemCount === 0
      ? 'No items yet'
      : result.list.remaining === 0
        ? `All ${result.list.itemCount} items bought`
        : `${result.list.remaining} of ${result.list.itemCount} items left`;
  archiveButton.textContent = result.list.archived ? 'Unarchive' : 'Archive';
  return result.list;
}

async function loadItems() {
  itemsEl.innerHTML = loadingState('Loading items…');
  pagerEl.hidden = true;
  try {
    const data = await listShoppingItems(listId, { page: state.page, limit: state.limit });
    if (state.page > data.totalPages) {
      state.page = data.totalPages;
      return loadItems();
    }
    if (!data.items.length) {
      itemsEl.innerHTML = emptyState({
        iconName: 'cart',
        title: 'Nothing on this list',
        text: 'Add an item above, or bring in a recipe or the meal plan.',
      });
      return;
    }
    renderItems(data.items);
    renderPagination(data);
  } catch (error) {
    if (error?.status === 404) {
      itemsEl.innerHTML = '';
      noticeEl.innerHTML = `
        <div class="alert alert--danger" role="alert">
          This list does not exist or is not in this household.
          <a href="/pages/shopping.html">Back to shopping</a>
        </div>`;
      return;
    }
    itemsEl.innerHTML = errorState(describeError(error));
  }
}

function buildField(label, inputHtml, hint = '') {
  return `
    <div class="field">
      <label>${label}</label>
      ${inputHtml}
      ${hint ? `<p class="field-hint">${hint}</p>` : ''}
    </div>`;
}

function categoryOptions(selected) {
  return Object.entries(CATEGORY_LABELS)
    .map(
      ([value, label]) =>
        `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`,
    )
    .join('');
}

// ---- Modals ----

function openRenameModal() {
  const body = document.createElement('form');
  body.className = 'form';
  body.innerHTML = `
    ${buildField('Name', '<input type="text" id="rename-name" maxlength="120" required>')}
    <p class="form-status" data-status role="status" aria-live="polite"></p>`;
  body.querySelector('#rename-name').value = state.list?.name ?? '';

  openModal({
    title: 'Rename list',
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: 'Save',
        variant: 'primary',
        onClick: async ({ close }) => {
          const name = body.querySelector('#rename-name').value.trim();
          const status = body.querySelector('[data-status]');
          if (!name) {
            setStatus(status, 'Give the list a name.', 'error');
            return;
          }
          try {
            await updateShoppingList(listId, { name });
            close();
            await loadListHeader();
            toast('List renamed.', { type: 'success' });
          } catch (error) {
            setStatus(status, describeError(error), 'error');
          }
        },
      },
    ],
  });
}

function openEditItemModal(item) {
  const body = document.createElement('form');
  body.className = 'form';
  body.innerHTML = `
    ${buildField('Item', '<input type="text" id="edit-name" maxlength="120" required>')}
    <div class="form-grid">
      ${buildField('Quantity', '<input type="number" id="edit-quantity" min="0.001" step="0.001">')}
      ${buildField('Unit', '<input type="text" id="edit-unit" maxlength="30" placeholder="kg, pcs…">')}
      ${buildField('Category', `<select id="edit-category">${categoryOptions(item.category)}</select>`)}
    </div>
    ${buildField('Notes', '<input type="text" id="edit-notes" maxlength="300">')}
    <p class="form-status" data-status role="status" aria-live="polite"></p>`;

  body.querySelector('#edit-name').value = item.name;
  body.querySelector('#edit-quantity').value = item.quantity ?? '';
  body.querySelector('#edit-unit').value = item.unit ?? '';
  body.querySelector('#edit-notes').value = item.notes ?? '';

  openModal({
    title: 'Edit item',
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: 'Save',
        variant: 'primary',
        onClick: async ({ close }) => {
          const status = body.querySelector('[data-status]');
          const name = body.querySelector('#edit-name').value.trim();
          if (!name) {
            setStatus(status, 'Give the item a name.', 'error');
            return;
          }
          try {
            await updateShoppingItem(listId, item.id, {
              name,
              quantity: body.querySelector('#edit-quantity').value || null,
              unit: body.querySelector('#edit-unit').value.trim() || null,
              category: body.querySelector('#edit-category').value,
              notes: body.querySelector('#edit-notes').value.trim() || null,
            });
            close();
            await loadItems();
            toast('Item updated.', { type: 'success' });
          } catch (error) {
            setStatus(status, describeError(error), 'error');
          }
        },
      },
    ],
  });
}

function openInventoryModal(item) {
  const body = document.createElement('form');
  body.className = 'form';
  body.innerHTML = `
    <div class="form-grid">
      ${buildField('Location', `<select id="inv-location">
        <option value="PANTRY">Pantry</option>
        <option value="REFRIGERATOR">Refrigerator</option>
        <option value="FREEZER">Freezer</option>
        <option value="HOUSEHOLD">Household</option>
        <option value="OTHER">Other</option>
      </select>`)}
      ${buildField('Category', `<select id="inv-category">${categoryOptions(item.category)}</select>`)}
      ${buildField('Expiry', '<input type="date" id="inv-expiry" min="1900-01-01" max="2100-12-31">')}
      ${buildField('Quantity', `<input type="number" id="inv-quantity" min="0.001" step="0.001" value="${item.quantity ?? ''}" placeholder="1">`, 'Defaults to the list quantity.')}
    </div>
    <p class="form-status" data-status role="status" aria-live="polite"></p>`;

  openModal({
    title: `Add ${item.name} to inventory`,
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: 'Add to inventory',
        variant: 'primary',
        onClick: async ({ close }) => {
          const status = body.querySelector('[data-status]');
          try {
            const result = await shoppingItemToInventory(listId, item.id, {
              location: body.querySelector('#inv-location').value,
              category: body.querySelector('#inv-category').value,
              expiresAt: body.querySelector('#inv-expiry').value || null,
              quantity: body.querySelector('#inv-quantity').value || null,
            });
            close();
            await loadItems();
            await loadListHeader();
            const quantity = body.querySelector('#inv-quantity').value;
            toast(
              result.merged
                ? `${item.name} added to existing stock${quantity ? ` (${quantity} ${item.unit ?? ''})` : ''}.`
                : `${item.name} added to inventory.`,
              { type: 'success' },
            );
          } catch (error) {
            setStatus(status, describeError(error), 'error');
          }
        },
      },
    ],
  });
}

async function loadRecipeOptions() {
  if (recipeOptions) {
    return recipeOptions;
  }
  const data = await listRecipes({ limit: 50, sort: 'title' });
  recipeOptions = data.items;
  return recipeOptions;
}

function openFromRecipeModal() {
  const body = document.createElement('form');
  body.className = 'form';
  body.innerHTML = `
    ${buildField('Recipe', '<select id="from-recipe-id"></select>')}
    ${buildField('Servings', '<input type="number" id="from-recipe-servings" min="1" max="100" placeholder="Recipe servings">', 'Multiplies the ingredient quantities.')}
    <p class="form-status" data-status role="status" aria-live="polite"></p>`;

  const select = body.querySelector('#from-recipe-id');

  openModal({
    title: 'Add a recipe',
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: 'Add ingredients',
        variant: 'primary',
        onClick: async ({ close }) => {
          const status = body.querySelector('[data-status]');
          if (!select.value) {
            setStatus(status, 'Choose a recipe.', 'error');
            return;
          }
          try {
            const result = await addRecipeToShoppingList(
              listId,
              select.value,
              body.querySelector('#from-recipe-servings').value || null,
            );
            close();
            await loadItems();
            await loadListHeader();
            toast(
              `Added ${result.added} ${result.added === 1 ? 'item' : 'items'}${result.merged ? `, merged ${result.merged}` : ''}.`,
              { type: 'success' },
            );
          } catch (error) {
            setStatus(status, describeError(error), 'error');
          }
        },
      },
    ],
  });

  loadRecipeOptions()
    .then((recipes) => {
      if (!recipes.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No recipes yet';
        select.append(option);
        return;
      }
      for (const recipe of recipes) {
        const option = document.createElement('option');
        option.value = recipe.id;
        option.textContent = recipe.servings
          ? `${recipe.title} (${recipe.servings} servings)`
          : recipe.title;
        select.append(option);
      }
    })
    .catch((error) => setStatus(body.querySelector('[data-status]'), describeError(error), 'error'));
}

function openFromMealsModal() {
  const today = new Date();
  const weekStart = addDays(today, -mondayIndex(today));
  const body = document.createElement('form');
  body.className = 'form';
  body.innerHTML = `
    <div class="form-grid">
      ${buildField('From', `<input type="date" id="meals-from" value="${toDateString(weekStart)}">`)}
      ${buildField('To', `<input type="date" id="meals-to" value="${toDateString(addDays(weekStart, 6))}">`)}
    </div>
    <div data-preview></div>
    <p class="form-status" data-status role="status" aria-live="polite"></p>`;

  let previewData = null;
  const previewHost = body.querySelector('[data-preview]');
  const status = body.querySelector('[data-status]');

  async function runPreview() {
    previewData = null;
    previewHost.innerHTML = loadingState('Checking the plan…');
    try {
      const from = body.querySelector('#meals-from').value;
      const to = body.querySelector('#meals-to').value;
      const plan = await previewMealsToShopping({ from, to });
      previewData = plan.items;
      if (!plan.items.length) {
        previewHost.innerHTML = '<p class="muted">No recipes planned in this period.</p>';
        return;
      }
      const list = document.createElement('div');
      list.className = 'item-list';
      plan.items.forEach((entry, index) => {
        const row = document.createElement('label');
        row.className = 'field--check';
        row.style.display = 'flex';
        row.style.gap = '0.5rem';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.dataset.index = String(index);
        const text = document.createElement('span');
        text.textContent = `${entry.name}${entry.quantity !== null ? ` — ${entry.quantity} ${entry.unit ?? ''}`.trimEnd() : ''}`;
        row.append(checkbox, text);
        list.append(row);
      });
      previewHost.replaceChildren(list);
    } catch (error) {
      previewHost.innerHTML = '';
      setStatus(status, describeError(error), 'error');
    }
  }

  openModal({
    title: 'Add the meal plan',
    body,
    actions: [
      { label: 'Check plan', variant: 'ghost', onClick: () => runPreview() },
      {
        label: 'Add selected',
        variant: 'primary',
        onClick: async ({ close }) => {
          if (!previewData) {
            await runPreview();
          }
          if (!previewData) {
            return;
          }
          const selected = [...previewHost.querySelectorAll('input[type="checkbox"]:checked')]
            .map((checkbox) => previewData[Number(checkbox.dataset.index)])
            .filter(Boolean);
          try {
            const result = await addMealsToShoppingList(listId, {
              from: body.querySelector('#meals-from').value,
              to: body.querySelector('#meals-to').value,
              items: selected,
            });
            close();
            await loadItems();
            await loadListHeader();
            toast(
              `Added ${result.added} ${result.added === 1 ? 'item' : 'items'}${result.merged ? `, merged ${result.merged}` : ''}.`,
              { type: 'success' },
            );
          } catch (error) {
            setStatus(status, describeError(error), 'error');
          }
        },
      },
    ],
  });

  runPreview();
}

// ---- Wiring ----

function wireEvents() {
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(addForm, true);
    setStatus(statusEl, 'Adding…', 'muted');
    try {
      await createShoppingItem(listId, {
        name: addForm.name.value.trim(),
        quantity: addForm.quantity.value || null,
        unit: addForm.unit.value.trim() || null,
        category: addForm.category.value,
      });
      addForm.reset();
      setStatus(statusEl, '');
      await loadItems();
      await loadListHeader();
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    } finally {
      setBusy(addForm, false);
    }
  });

  document.querySelector('[data-rename]').addEventListener('click', openRenameModal);
  document.querySelector('[data-from-recipe]').addEventListener('click', openFromRecipeModal);
  document.querySelector('[data-from-meals]').addEventListener('click', openFromMealsModal);

  archiveButton.addEventListener('click', async () => {
    try {
      await updateShoppingList(listId, { archived: !state.list?.archived });
      const list = await loadListHeader();
      toast(list.archived ? 'List archived.' : 'List restored.', { type: 'success' });
    } catch (error) {
      toast(describeError(error), { type: 'error' });
    }
  });

  document.querySelector('[data-delete]').addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Delete list',
      message: 'Delete this list and all of its items?',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteShoppingList(listId);
      toast('List deleted.', { type: 'success' });
      window.location.assign('/pages/shopping.html');
    } catch (error) {
      toast(describeError(error), { type: 'error' });
    }
  });

  document.querySelector('[data-page-prev]').addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    loadItems();
  });
  document.querySelector('[data-page-next]').addEventListener('click', () => {
    state.page += 1;
    loadItems();
  });
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  wireEvents();
  try {
    await loadListHeader();
  } catch (error) {
    if (error?.status === 404) {
      noticeEl.innerHTML = `
        <div class="alert alert--danger" role="alert">
          This list does not exist or is not in this household.
          <a href="/pages/shopping.html">Back to shopping</a>
        </div>`;
      addForm.hidden = true;
      itemsEl.innerHTML = '';
      return;
    }
    if (error?.status === 403) {
      noticeEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to keep shopping lists.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    itemsEl.innerHTML = errorState(describeError(error));
    return;
  }
  await loadItems();
}

init().catch((error) => {
  itemsEl.innerHTML = errorState(describeError(error));
});
