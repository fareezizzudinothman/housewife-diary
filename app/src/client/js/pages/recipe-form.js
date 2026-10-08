import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { describeError, setStatus, setBusy } from '../utils/forms.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import {
  getRecipe,
  getRecipeMeta,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  duplicateRecipe,
} from '../api/recipes.js';

/* Recipe form — structured ingredient rows (name, quantity, unit, optional,
   notes). The server owns validation and scaling for shopping. */

const recipeId = new URLSearchParams(window.location.search).get('id');
const isEdit = Boolean(recipeId);
const form = document.getElementById('recipe-form');
const statusEl = document.getElementById('recipe-form-status');
const noticeEl = document.querySelector('[data-form-notice]');
const rowsHost = document.querySelector('[data-ingredient-rows]');
const deleteButton = document.querySelector('[data-delete]');
const duplicateButton = document.querySelector('[data-duplicate]');

function addIngredientRow(data = {}) {
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.innerHTML = `
    <input class="ingredient-row__name" type="text" maxlength="120" placeholder="Ingredient" aria-label="Ingredient name">
    <input class="ingredient-row__qty" type="number" min="0.001" step="0.001" placeholder="Qty" aria-label="Quantity">
    <input class="ingredient-row__unit" type="text" maxlength="30" placeholder="Unit" aria-label="Unit">
    <label class="ingredient-row__optional field--check"><input type="checkbox"> Optional</label>
    <button type="button" class="icon-btn icon-btn--danger ingredient-row__remove" aria-label="Remove ingredient">${icon('trash')}</button>
    <input class="ingredient-row__notes" type="text" maxlength="200" placeholder="Notes (optional)" aria-label="Ingredient notes">`;

  row.querySelector('.ingredient-row__name').value = data.name ?? '';
  row.querySelector('.ingredient-row__qty').value = data.quantity ?? '';
  row.querySelector('.ingredient-row__unit').value = data.unit ?? '';
  row.querySelector('.ingredient-row__optional input').checked = data.optional ?? false;
  row.querySelector('.ingredient-row__notes').value = data.notes ?? '';
  row.querySelector('.ingredient-row__remove').addEventListener('click', () => {
    row.remove();
    if (!rowsHost.children.length) {
      addIngredientRow();
    }
  });
  rowsHost.append(row);
}

function readIngredients() {
  const ingredients = [];
  for (const row of rowsHost.querySelectorAll('.ingredient-row')) {
    const name = row.querySelector('.ingredient-row__name').value.trim();
    if (!name) {
      continue;
    }
    ingredients.push({
      name,
      quantity: row.querySelector('.ingredient-row__qty').value || null,
      unit: row.querySelector('.ingredient-row__unit').value || null,
      optional: row.querySelector('.ingredient-row__optional input').checked,
      notes: row.querySelector('.ingredient-row__notes').value || null,
    });
  }
  return ingredients;
}

function buildPayload() {
  return {
    title: form.title.value.trim(),
    description: form.description.value.trim() || null,
    instructions: form.instructions.value.trim() || null,
    servings: form.servings.value || null,
    prepMinutes: form.prepMinutes.value || null,
    cookMinutes: form.cookMinutes.value || null,
    category: form.category.value.trim() || null,
    cuisine: form.cuisine.value.trim() || null,
    notes: form.notes.value.trim() || null,
    isFavourite: form.isFavourite.checked,
    ingredients: readIngredients(),
  };
}

function prefill(recipe) {
  form.title.value = recipe.title;
  form.description.value = recipe.description ?? '';
  form.instructions.value = recipe.instructions ?? '';
  form.servings.value = recipe.servings ?? '';
  form.prepMinutes.value = recipe.prepMinutes ?? '';
  form.cookMinutes.value = recipe.cookMinutes ?? '';
  form.category.value = recipe.category ?? '';
  form.cuisine.value = recipe.cuisine ?? '';
  form.notes.value = recipe.notes ?? '';
  form.isFavourite.checked = recipe.isFavourite;

  rowsHost.replaceChildren();
  if (recipe.ingredients.length) {
    for (const ingredient of recipe.ingredients) {
      addIngredientRow(ingredient);
    }
  } else {
    addIngredientRow();
  }

  document.querySelector('[data-form-title]').textContent = 'Edit recipe';
  document.querySelector('[data-form-subtitle]').textContent =
    'Changes apply to the whole household cookbook.';
  document.body.dataset.pageTitle = 'Edit recipe';
  document.title = 'Edit recipe — Housewife Diary';
  deleteButton.hidden = false;
  duplicateButton.hidden = false;
}

function showNotice(html) {
  noticeEl.innerHTML = html;
}

function wireEvents() {
  document.querySelector('[data-add-ingredient]').addEventListener('click', () => {
    addIngredientRow();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(form, true);
    setStatus(statusEl, isEdit ? 'Saving changes…' : 'Saving recipe…', 'muted');
    try {
      const payload = buildPayload();
      if (isEdit) {
        await updateRecipe(recipeId, payload);
      } else {
        await createRecipe(payload);
      }
      toast(isEdit ? 'Recipe updated.' : 'Recipe saved.', { type: 'success' });
      window.location.assign('/pages/recipes.html');
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    } finally {
      setBusy(form, false);
    }
  });

  duplicateButton.addEventListener('click', async () => {
    duplicateButton.disabled = true;
    try {
      const result = await duplicateRecipe(recipeId);
      toast('Recipe duplicated.', { type: 'success' });
      window.location.assign(
        `/pages/recipe-form.html?id=${encodeURIComponent(result.recipe.id)}`,
      );
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    } finally {
      duplicateButton.disabled = false;
    }
  });

  deleteButton.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Delete recipe',
      message: 'Delete this recipe? Planned meals that used it keep its name.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteRecipe(recipeId);
      toast('Recipe deleted.', { type: 'success' });
      window.location.assign('/pages/recipes.html');
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    }
  });
}

async function loadCategoryOptions() {
  try {
    const meta = await getRecipeMeta();
    const datalist = document.getElementById('recipe-category-options');
    for (const category of meta.categories) {
      const option = document.createElement('option');
      option.value = category;
      datalist.append(option);
    }
  } catch {
    // Suggestions only; free text still works.
  }
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  wireEvents();
  await loadCategoryOptions();

  if (isEdit) {
    try {
      const result = await getRecipe(recipeId);
      prefill(result.recipe);
    } catch (error) {
      if (error?.status === 404) {
        showNotice(`
          <div class="alert alert--danger" role="alert">
            This recipe does not exist or is not in this household.
            <a href="/pages/recipes.html">Back to recipes</a>
          </div>`);
        form.querySelector('[type="submit"]').disabled = true;
        return;
      }
      if (error?.status === 403) {
        showNotice(`
          <div class="alert alert--warning" role="alert">
            <strong>No active household.</strong> Create or join a household to keep recipes.
            <a href="/pages/household.html">Set up a household</a>
          </div>`);
        form.querySelector('[type="submit"]').disabled = true;
        return;
      }
      setStatus(statusEl, describeError(error), 'error');
      return;
    }
  } else {
    addIngredientRow();
  }
}

init().catch((error) => {
  setStatus(statusEl, describeError(error), 'error');
});
