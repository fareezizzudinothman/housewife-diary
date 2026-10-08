import { fieldError, throwValidationError } from './shared.js';
import { parseDateString } from './format.js';
import { MEAL_TYPES, validateEnum, validateOptionalLine, validateOptionalText } from './kitchen.js';

const MAX_TITLE = 160;
const MAX_NOTES = 1000;
const MAX_RANGE_DAYS = 90;

// Cuid-like ids used for recipe references.
const ID_PATTERN = /^[a-z0-9]{10,64}$/;

function validateDateOnly(value, field, errors, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      errors.push(fieldError(field, 'Choose a valid date.'));
    }
    return required ? null : undefined;
  }
  const parsed = parseDateString(value);
  if (parsed === null) {
    errors.push(fieldError(field, 'Choose a valid YYYY-MM-DD date.'));
  }
  return parsed;
}

function validateRecipeId(value, errors) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    errors.push(fieldError('recipeId', 'Choose a recipe from the list.'));
    return null;
  }
  return value;
}

export function validateCreateMeal(input) {
  const errors = [];

  const date = validateDateOnly(input?.date, 'date', errors);
  const mealType = validateEnum(input?.mealType, MEAL_TYPES, 'mealType', errors, { required: true });
  const recipeId = validateRecipeId(input?.recipeId, errors) ?? null;
  const title = validateOptionalLine(input?.title, 'title', MAX_TITLE, errors);
  const notes = validateOptionalText(input?.notes, 'notes', MAX_NOTES, errors);

  if (!recipeId && !title) {
    errors.push(fieldError('title', 'Choose a recipe or give the meal a title.'));
  }

  if (errors.length) {
    throwValidationError(errors);
  }

  return {
    date,
    mealType: mealType.value,
    recipeId,
    title: title ?? null,
    notes: notes ?? null,
  };
}

export function validateUpdateMeal(input) {
  const errors = [];
  const patch = {};
  let provided = false;

  if (input?.date !== undefined) {
    provided = true;
    patch.date = validateDateOnly(input.date, 'date', errors);
  }
  if (input?.mealType !== undefined) {
    provided = true;
    const mealType = validateEnum(input.mealType, MEAL_TYPES, 'mealType', errors, { required: true });
    patch.mealType = mealType.value;
  }
  if (input?.recipeId !== undefined) {
    provided = true;
    patch.recipeId = validateRecipeId(input.recipeId, errors);
  }
  if (input?.title !== undefined) {
    provided = true;
    patch.title = validateOptionalLine(input.title, 'title', MAX_TITLE, errors);
  }
  if (input?.notes !== undefined) {
    provided = true;
    patch.notes = validateOptionalText(input.notes, 'notes', MAX_NOTES, errors);
  }

  if (!provided) {
    errors.push(fieldError('body', 'Provide at least one field to update.'));
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return patch;
}

// Shared by the weekly list and the shopping-plan preview.
export function validateMealRangeQuery(input) {
  const errors = [];
  const query = {};

  const from = validateDateOnly(input?.from, 'from', errors, { required: false });
  const to = validateDateOnly(input?.to, 'to', errors, { required: false });
  if (from && to) {
    if (to < from) {
      errors.push(fieldError('to', 'To must be on or after from.'));
    } else if ((to - from) / 86_400_000 >= MAX_RANGE_DAYS) {
      errors.push(fieldError('to', `Range must be at most ${MAX_RANGE_DAYS} days.`));
    }
    query.from = from;
    query.to = to;
  } else if (from) {
    // A single bound means "one week from here" for the weekly planner.
    query.from = from;
    query.to = new Date(from.getTime() + 6 * 86_400_000);
  } else if (to) {
    query.to = to;
    query.from = new Date(to.getTime() - 6 * 86_400_000);
  }

  const mealType = validateEnum(input?.mealType, MEAL_TYPES, 'mealType', errors);
  if (mealType.value) {
    query.mealType = mealType.value;
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  return query;
}
