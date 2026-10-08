import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { describeError, setStatus, setBusy } from '../utils/forms.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { todayString } from '../utils/dates.js';
import { getMeal, createMeal, updateMeal, deleteMeal } from '../api/meals.js';
import { listRecipes } from '../api/recipes.js';

/* Meal form — a date + slot + recipe (or free-text name). */

const params = new URLSearchParams(window.location.search);
const mealId = params.get('id');
const presetDate = params.get('date');
const presetType = params.get('mealType');
const isEdit = Boolean(mealId);

const form = document.getElementById('meal-form');
const statusEl = document.getElementById('meal-form-status');
const noticeEl = document.querySelector('[data-form-notice]');
const deleteButton = document.querySelector('[data-delete]');

function buildPayload() {
  return {
    date: form.date.value,
    mealType: form.mealType.value,
    recipeId: form.recipeId.value || null,
    title: form.title.value.trim() || null,
    notes: form.notes.value.trim() || null,
  };
}

function showNotice(html) {
  noticeEl.innerHTML = html;
}

async function loadRecipes() {
  try {
    const data = await listRecipes({ limit: 50, sort: 'title' });
    for (const recipe of data.items) {
      const option = document.createElement('option');
      option.value = recipe.id;
      option.textContent = recipe.title;
      form.recipeId.append(option);
    }
  } catch {
    // The meal can still be named with free text.
  }
}

function prefill(meal) {
  form.date.value = meal.date;
  form.mealType.value = meal.mealType;
  form.recipeId.value = meal.recipe?.id ?? '';
  form.title.value = meal.title ?? '';
  form.notes.value = meal.notes ?? '';

  document.querySelector('[data-form-title]').textContent = 'Edit meal';
  document.querySelector('[data-form-subtitle]').textContent =
    'Update the plan for this meal.';
  document.body.dataset.pageTitle = 'Edit meal';
  document.title = 'Edit meal — Housewife Diary';
  deleteButton.hidden = false;
}

function wireEvents() {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(form, true);
    setStatus(statusEl, isEdit ? 'Saving changes…' : 'Saving meal…', 'muted');
    try {
      const payload = buildPayload();
      if (isEdit) {
        await updateMeal(mealId, payload);
      } else {
        await createMeal(payload);
      }
      toast(isEdit ? 'Meal updated.' : 'Meal planned.', { type: 'success' });
      window.location.assign('/pages/meals.html');
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    } finally {
      setBusy(form, false);
    }
  });

  deleteButton.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Remove meal',
      message: 'Remove this meal from the plan?',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteMeal(mealId);
      toast('Meal removed.', { type: 'success' });
      window.location.assign('/pages/meals.html');
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
  wireEvents();
  await loadRecipes();

  if (isEdit) {
    try {
      const result = await getMeal(mealId);
      prefill(result.meal);
    } catch (error) {
      if (error?.status === 404) {
        showNotice(`
          <div class="alert alert--danger" role="alert">
            This meal does not exist or is not in this household.
            <a href="/pages/meals.html">Back to the meal plan</a>
          </div>`);
        form.querySelector('[type="submit"]').disabled = true;
        return;
      }
      if (error?.status === 403) {
        showNotice(`
          <div class="alert alert--warning" role="alert">
            <strong>No active household.</strong> Create or join a household to plan meals.
            <a href="/pages/household.html">Set up a household</a>
          </div>`);
        form.querySelector('[type="submit"]').disabled = true;
        return;
      }
      setStatus(statusEl, describeError(error), 'error');
      return;
    }
  } else {
    form.date.value = presetDate || todayString();
    if (['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'].includes(presetType)) {
      form.mealType.value = presetType;
    }
  }
}

init().catch((error) => {
  setStatus(statusEl, describeError(error), 'error');
});
