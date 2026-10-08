import { fieldError, throwValidationError } from './shared.js';
import { normalizeSingleLine } from './format.js';
import {
  validateBoolean,
  validateBooleanQuery,
  validateEnum,
  validateLookupName,
  validateOptionalInt,
  validateOptionalLine,
  validateOptionalText,
  validatePageParams,
  validateQuantity,
  validateUnit,
} from './kitchen.js';

export const RECIPE_SORTS = Object.freeze(['updated', 'created', 'title']);

const MAX_TITLE = 160;
const MAX_LINE = 60;
const MAX_DESCRIPTION = 2000;
const MAX_INSTRUCTIONS = 20000;
const MAX_NOTES = 2000;
const MAX_SEARCH = 100;
const MAX_INGREDIENTS = 50;
const MAX_INGREDIENT_NAME = 120;
const MAX_INGREDIENT_NOTES = 200;
const MAX_SERVINGS = 100;
const MAX_MINUTES = 1440;

// Ingredients are always a structured list; an absent list on update means
// "leave the ingredients unchanged", an empty list clears them.
function validateIngredients(value, errors) {
  if (!Array.isArray(value)) {
    errors.push(fieldError('ingredients', 'Ingredients must be a list.'));
    return [];
  }
  if (value.length > MAX_INGREDIENTS) {
    errors.push(
      fieldError('ingredients', `A recipe can have at most ${MAX_INGREDIENTS} ingredients.`),
    );
  }
  const ingredients = [];
  value.slice(0, MAX_INGREDIENTS).forEach((raw, index) => {
    const field = `ingredients[${index}]`;
    const name = validateLookupName(raw?.name, `${field}.name`, MAX_INGREDIENT_NAME, errors);
    const quantity = validateQuantity(raw?.quantity, `${field}.quantity`, errors, {
      allowZero: false,
    });
    const unit = raw?.unit === undefined ? { unit: null } : validateUnit(raw?.unit, errors, `${field}.unit`);
    const notes = validateOptionalText(raw?.notes, `${field}.notes`, MAX_INGREDIENT_NOTES, errors);
    if (!name) {
      return;
    }
    ingredients.push({
      name: name.name,
      normalized: name.normalized,
      quantity: quantity ?? null,
      unit: unit?.unit ?? null,
      optional: raw?.optional === true,
      notes: notes ?? null,
      sortOrder: ingredients.length,
    });
  });
  return ingredients;
}

function validateTitle(value, errors) {
  const title = normalizeSingleLine(value, MAX_TITLE);
  if (title === null) {
    errors.push(fieldError('title', `Title must be 1-${MAX_TITLE} characters.`));
  }
  return title;
}

export function validateCreateRecipe(input) {
  const errors = [];

  const title = validateTitle(input?.title, errors);
  const description = validateOptionalText(input?.description, 'description', MAX_DESCRIPTION, errors);
  const instructions = validateOptionalText(input?.instructions, 'instructions', MAX_INSTRUCTIONS, errors);
  const servings = validateOptionalInt(input?.servings, 'servings', { min: 1, max: MAX_SERVINGS }, errors);
  const prepMinutes = validateOptionalInt(input?.prepMinutes, 'prepMinutes', { min: 0, max: MAX_MINUTES }, errors);
  const cookMinutes = validateOptionalInt(input?.cookMinutes, 'cookMinutes', { min: 0, max: MAX_MINUTES }, errors);
  const category = validateOptionalLine(input?.category, 'category', MAX_LINE, errors);
  const cuisine = validateOptionalLine(input?.cuisine, 'cuisine', MAX_LINE, errors);
  const notes = validateOptionalText(input?.notes, 'notes', MAX_NOTES, errors);
  const favourite = validateBoolean(input?.isFavourite, 'isFavourite', errors);
  const ingredients = validateIngredients(input?.ingredients ?? [], errors);

  if (errors.length) {
    throwValidationError(errors);
  }

  return {
    title,
    description,
    instructions,
    servings,
    prepMinutes,
    cookMinutes,
    category,
    cuisine,
    notes,
    isFavourite: favourite.value ?? false,
    ingredients,
  };
}

export function validateUpdateRecipe(input) {
  const errors = [];
  const patch = {};
  let provided = false;

  if (input?.title !== undefined) {
    provided = true;
    patch.title = validateTitle(input.title, errors);
  }
  if (input?.description !== undefined) {
    provided = true;
    patch.description = validateOptionalText(input.description, 'description', MAX_DESCRIPTION, errors);
  }
  if (input?.instructions !== undefined) {
    provided = true;
    patch.instructions = validateOptionalText(input.instructions, 'instructions', MAX_INSTRUCTIONS, errors);
  }
  if (input?.servings !== undefined) {
    provided = true;
    patch.servings = validateOptionalInt(input.servings, 'servings', { min: 1, max: MAX_SERVINGS }, errors);
  }
  if (input?.prepMinutes !== undefined) {
    provided = true;
    patch.prepMinutes = validateOptionalInt(input.prepMinutes, 'prepMinutes', { min: 0, max: MAX_MINUTES }, errors);
  }
  if (input?.cookMinutes !== undefined) {
    provided = true;
    patch.cookMinutes = validateOptionalInt(input.cookMinutes, 'cookMinutes', { min: 0, max: MAX_MINUTES }, errors);
  }
  if (input?.category !== undefined) {
    provided = true;
    patch.category = validateOptionalLine(input.category, 'category', MAX_LINE, errors);
  }
  if (input?.cuisine !== undefined) {
    provided = true;
    patch.cuisine = validateOptionalLine(input.cuisine, 'cuisine', MAX_LINE, errors);
  }
  if (input?.notes !== undefined) {
    provided = true;
    patch.notes = validateOptionalText(input.notes, 'notes', MAX_NOTES, errors);
  }
  if (input?.isFavourite !== undefined) {
    provided = true;
    const favourite = validateBoolean(input.isFavourite, 'isFavourite', errors);
    if (favourite.provided) {
      patch.isFavourite = favourite.value;
    }
  }
  if (input?.ingredients !== undefined) {
    provided = true;
    patch.ingredients = validateIngredients(input.ingredients, errors);
  }

  if (!provided) {
    errors.push(fieldError('body', 'Provide at least one field to update.'));
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return patch;
}

export function validateListRecipeQuery(input) {
  const errors = [];
  const query = validatePageParams(input, errors);

  const search = typeof input?.search === 'string' ? input.search.trim() : '';
  if (search.length > MAX_SEARCH) {
    errors.push(fieldError('search', `Search must be at most ${MAX_SEARCH} characters.`));
  } else if (search) {
    query.search = search;
  }

  const category = validateOptionalLine(input?.category, 'category', MAX_LINE, errors);
  if (category) {
    query.category = category;
  }

  const favourite = validateBooleanQuery(input?.favourite, 'favourite', errors);
  if (favourite.value !== undefined) {
    query.favourite = favourite.value;
  }

  const sort = validateEnum(input?.sort, RECIPE_SORTS, 'sort', errors);
  if (sort.value) {
    query.sort = sort.value;
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  return query;
}

export function validateRecipeCopy(input) {
  const errors = [];
  const title = validateOptionalLine(input?.title, 'title', MAX_TITLE, errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return { title };
}
