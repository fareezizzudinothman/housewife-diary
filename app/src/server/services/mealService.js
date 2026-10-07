import { AppError, ErrorCodes } from '../../shared/errors.js';
import { fieldError, throwValidationError } from '../validators/shared.js';
import * as mealRepository from '../repositories/mealRepository.js';
import * as recipeRepository from '../repositories/recipeRepository.js';
import { DAY_MS } from '../utils/recurrence.js';
import { startOfDayFromString, toDateString } from '../utils/time.js';

// Chronological order for display; the DB enum order is not relied upon.
export const MEAL_ORDER = Object.freeze({ BREAKFAST: 0, LUNCH: 1, SNACK: 2, DINNER: 3 });
const MEAL_HOURS = { BREAKFAST: 8, LUNCH: 12, SNACK: 15, DINNER: 18 };

function notFound() {
  return new AppError('Meal not found.', {
    code: ErrorCodes.NOT_FOUND,
    status: 404,
  });
}

const MEAL_TYPE_LABELS = Object.freeze({
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  SNACK: 'Snack',
  DINNER: 'Dinner',
});

// Defensive display title: recipe name, then free text, then the meal slot.
function mealDisplayTitle(entry) {
  return entry.recipe?.title ?? entry.title ?? MEAL_TYPE_LABELS[entry.mealType] ?? 'Meal';
}

function toEntryView(entry) {
  return {
    id: entry.id,
    date: entry.date.toISOString().slice(0, 10),
    mealType: entry.mealType,
    title: entry.title,
    notes: entry.notes,
    displayTitle: mealDisplayTitle(entry),
    recipe: entry.recipe
      ? { id: entry.recipe.id, title: entry.recipe.title, servings: entry.recipe.servings }
      : null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function sortEntries(entries) {
  return [...entries].sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      (MEAL_ORDER[a.mealType] ?? 9) - (MEAL_ORDER[b.mealType] ?? 9) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

// Monday–Sunday week containing the user's local today.
export function currentWeekBounds(timezone, now = new Date()) {
  const [year, month, day] = toDateString(now, timezone).split('-').map(Number);
  const today = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const from = new Date(today.getTime() - mondayOffset * DAY_MS);
  const to = new Date(from.getTime() + 6 * DAY_MS);
  return { from, to };
}

function resolveRange(user, query) {
  const timezone = user.timezone ?? 'UTC';
  const week = currentWeekBounds(timezone);
  return { from: query.from ?? week.from, to: query.to ?? week.to, timezone };
}

async function assertRecipe(recipeId, householdId) {
  if (!recipeId) {
    return null;
  }
  const recipe = await recipeRepository.findRecipeById(recipeId, householdId);
  if (!recipe) {
    throwValidationError([fieldError('recipeId', 'Choose a recipe from the list.')]);
  }
  return recipe;
}

export async function listMeals({ user, householdId, query }) {
  const range = resolveRange(user, query);
  const entries = await mealRepository.listRange(
    householdId,
    range.from,
    range.to,
    query.mealType,
  );
  return {
    items: sortEntries(entries).map(toEntryView),
    from: range.from.toISOString().slice(0, 10),
    to: range.to.toISOString().slice(0, 10),
  };
}

export async function getMeal({ householdId, id }) {
  const entry = await mealRepository.findEntryById(id, householdId);
  if (!entry) {
    throw notFound();
  }
  return toEntryView(entry);
}

export async function createMeal({ user, householdId, data }) {
  await assertRecipe(data.recipeId, householdId);
  const entry = await mealRepository.createEntry({
    householdId,
    createdById: user.id,
    recipeId: data.recipeId,
    date: data.date,
    mealType: data.mealType,
    title: data.title,
    notes: data.notes,
  });
  return toEntryView(entry);
}

export async function updateMeal({ householdId, id, patch }) {
  const existing = await mealRepository.findEntryById(id, householdId);
  if (!existing) {
    throw notFound();
  }

  const effectiveRecipeId =
    patch.recipeId !== undefined ? patch.recipeId : existing.recipeId;
  const effectiveTitle = patch.title !== undefined ? patch.title : existing.title;
  if (!effectiveRecipeId && !effectiveTitle) {
    throwValidationError([fieldError('title', 'Choose a recipe or give the meal a title.')]);
  }
  if (patch.recipeId) {
    await assertRecipe(patch.recipeId, householdId);
  }

  const entry = await mealRepository.updateEntry(id, householdId, patch);
  return toEntryView(entry);
}

export async function deleteMeal({ householdId, id }) {
  const entry = await mealRepository.findEntryById(id, householdId);
  if (!entry) {
    throw notFound();
  }
  await mealRepository.deleteEntry(id, householdId);
  return { id, deleted: true };
}

// ---- Cross-module helpers (calendar + dashboard + shopping) ----

// Meal entries surface on the calendar as all-day derived items (sourceType
// MEAL). The nominal hour keeps breakfast/lunch/snack/dinner in a natural
// order without displaying a time (allDay suppresses it client-side).
export function toMealEventView(entry, timezone) {
  const dateString = entry.date.toISOString().slice(0, 10);
  const startAt = new Date(
    startOfDayFromString(dateString, timezone) + (MEAL_HOURS[entry.mealType] ?? 12) * 3_600_000,
  );
  return {
    id: `meal:${entry.id}`,
    sourceType: 'MEAL',
    sourceId: entry.id,
    title: mealDisplayTitle(entry),
    description: entry.notes,
    location: null,
    startAt: startAt.toISOString(),
    endAt: startAt.toISOString(),
    allDay: true,
    category: null,
    reminder: null,
    recurrence: null,
    recurring: false,
    meal: {
      id: entry.id,
      mealType: entry.mealType,
      title: entry.title,
      recipe: entry.recipe ? { id: entry.recipe.id, title: entry.recipe.title } : null,
    },
    createdBy: null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export function mealOrderValue(mealType) {
  return MEAL_ORDER[mealType] ?? 9;
}

export function resolveMealRange(user, query) {
  return resolveRange(user, query);
}

// Compact shape for the dashboard sections.
export function toMealSummaryView(entry) {
  return {
    id: entry.id,
    date: entry.date.toISOString().slice(0, 10),
    mealType: entry.mealType,
    displayTitle: mealDisplayTitle(entry),
    recipeId: entry.recipe?.id ?? null,
  };
}
