import { fieldError, throwValidationError } from './shared.js';
import { normalizeSingleLine, parseDateString } from './format.js';
import {
  ITEM_CATEGORIES,
  INVENTORY_LOCATIONS,
  validateBoolean,
  validateBooleanQuery,
  validateEnum,
  validateLookupName,
  validateOptionalText,
  validatePageParams,
  validateQuantity,
  validateUnit,
} from './kitchen.js';

const MAX_LIST_NAME = 120;
const MAX_ITEM_NAME = 120;
const MAX_NOTES = 1000;
const MAX_ITEM_NOTES = 300;
const MAX_SEARCH = 100;
const MAX_BULK_ITEMS = 100;
const MAX_SERVINGS = 100;
const MAX_RANGE_DAYS = 90;

function parseListName(value) {
  return normalizeSingleLine(value, MAX_LIST_NAME);
}

export function validateCreateList(input) {
  const errors = [];
  const name = parseListName(input?.name);
  if (name === null) {
    errors.push(fieldError('name', `Name must be 1-${MAX_LIST_NAME} characters.`));
  }
  const notes = validateOptionalText(input?.notes, 'notes', MAX_NOTES, errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return { name, notes: notes ?? null };
}

export function validateUpdateList(input) {
  const errors = [];
  const patch = {};
  let provided = false;

  if (input?.name !== undefined) {
    provided = true;
    const name = parseListName(input.name);
    if (name === null) {
      errors.push(fieldError('name', `Name must be 1-${MAX_LIST_NAME} characters.`));
    } else {
      patch.name = name;
    }
  }
  if (input?.notes !== undefined) {
    provided = true;
    patch.notes = validateOptionalText(input.notes, 'notes', MAX_NOTES, errors);
  }
  if (input?.archived !== undefined) {
    provided = true;
    const archived = validateBoolean(input.archived, 'archived', errors);
    if (archived.provided) {
      patch.archived = archived.value;
    }
  }

  if (!provided) {
    errors.push(fieldError('body', 'Provide at least one field to update.'));
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return patch;
}

export function validateListShoppingQuery(input) {
  const errors = [];
  const query = validatePageParams(input, errors);

  const search = typeof input?.search === 'string' ? input.search.trim() : '';
  if (search.length > MAX_SEARCH) {
    errors.push(fieldError('search', `Search must be at most ${MAX_SEARCH} characters.`));
  } else if (search) {
    query.search = search;
  }

  const archived = validateBooleanQuery(input?.archived, 'archived', errors);
  if (archived.value !== undefined) {
    query.archived = archived.value;
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  return query;
}

function validateItemFields(input, errors, { partial = false } = {}) {
  const item = {};
  let provided = false;

  if (!partial || input?.name !== undefined) {
    provided = true;
    const name = validateLookupName(input?.name, 'name', MAX_ITEM_NAME, errors);
    if (name) {
      item.name = name.name;
      item.normalized = name.normalized;
    }
  }

  if (input?.quantity !== undefined) {
    provided = true;
    if (input.quantity === null || input.quantity === '') {
      item.quantity = null;
    } else {
      item.quantity = validateQuantity(input.quantity, 'quantity', errors, { allowZero: false });
    }
  } else if (!partial) {
    item.quantity = null;
  }

  if (input?.unit !== undefined) {
    provided = true;
    if (input.unit === null || input.unit === '') {
      item.unit = null;
    } else {
      const unit = validateUnit(input.unit, errors);
      item.unit = unit?.unit ?? null;
    }
  } else if (!partial) {
    item.unit = null;
  }

  if (input?.category !== undefined) {
    provided = true;
    const category = validateEnum(input.category, ITEM_CATEGORIES, 'category', errors);
    if (category.value) {
      item.category = category.value;
    }
  } else if (!partial) {
    item.category = 'OTHER';
  }

  if (input?.notes !== undefined) {
    provided = true;
    item.notes = validateOptionalText(input.notes, 'notes', MAX_ITEM_NOTES, errors);
  } else if (!partial) {
    item.notes = null;
  }

  return { item, provided };
}

export function validateCreateItem(input) {
  const errors = [];
  const { item } = validateItemFields(input, errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return { ...item, notes: item.notes ?? null };
}

export function validateUpdateItem(input) {
  const errors = [];
  const { item, provided } = validateItemFields(input, errors, { partial: true });

  if (input?.purchased !== undefined) {
    const purchased = validateBoolean(input.purchased, 'purchased', errors);
    if (purchased.provided) {
      item.purchased = purchased.value;
    }
  }

  if (!provided && input?.purchased === undefined) {
    errors.push(fieldError('body', 'Provide at least one field to update.'));
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return item;
}

export function validateItemsQuery(input) {
  const errors = [];
  const query = validatePageParams(input, errors, { defaultLimit: 100, maxLimit: 200 });

  const purchased = validateBooleanQuery(input?.purchased, 'purchased', errors);
  if (purchased.value !== undefined) {
    query.purchased = purchased.value;
  }

  const category = validateEnum(input?.category, ITEM_CATEGORIES, 'category', errors);
  if (category.value) {
    query.category = category.value;
  }

  const search = typeof input?.search === 'string' ? input.search.trim() : '';
  if (search.length > MAX_SEARCH) {
    errors.push(fieldError('search', `Search must be at most ${MAX_SEARCH} characters.`));
  } else if (search) {
    query.search = search;
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  return query;
}

export function validateFromRecipe(input) {
  const errors = [];
  let servings = null;
  if (input?.servings !== undefined && input.servings !== null && input.servings !== '') {
    servings = Number(input.servings);
    if (!Number.isInteger(servings) || servings < 1 || servings > MAX_SERVINGS) {
      errors.push(fieldError('servings', `Servings must be between 1 and ${MAX_SERVINGS}.`));
    }
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return { servings };
}

function validateDateBound(value, field, errors) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = parseDateString(value);
  if (parsed === null) {
    errors.push(fieldError(field, 'Choose a valid YYYY-MM-DD date.'));
  }
  return parsed;
}

export function validateFromMeals(input) {
  const errors = [];
  const from = validateDateBound(input?.from, 'from', errors);
  const to = validateDateBound(input?.to, 'to', errors);
  if (!from) {
    errors.push(fieldError('from', 'Choose a start date.'));
  }
  if (!to) {
    errors.push(fieldError('to', 'Choose an end date.'));
  }
  if (from && to) {
    if (to < from) {
      errors.push(fieldError('to', 'To must be on or after from.'));
    } else if ((to - from) / 86_400_000 >= MAX_RANGE_DAYS) {
      errors.push(fieldError('to', `Range must be at most ${MAX_RANGE_DAYS} days.`));
    }
  }

  let items = null;
  if (input?.items !== undefined) {
    if (!Array.isArray(input.items)) {
      errors.push(fieldError('items', 'Items must be a list.'));
    } else if (input.items.length > MAX_BULK_ITEMS) {
      errors.push(fieldError('items', `At most ${MAX_BULK_ITEMS} items can be added at once.`));
    } else {
      items = [];
      input.items.forEach((raw, index) => {
        const field = `items[${index}]`;
        const name = validateLookupName(raw?.name, `${field}.name`, MAX_ITEM_NAME, errors);
        const quantity = validateQuantity(raw?.quantity, `${field}.quantity`, errors, {
          allowZero: false,
        });
        const unit =
          raw?.unit === undefined
            ? { unit: null }
            : validateUnit(raw.unit, errors, `${field}.unit`);
        const category = validateEnum(raw?.category, ITEM_CATEGORIES, `${field}.category`, errors);
        if (name) {
          items.push({
            name: name.name,
            normalized: name.normalized,
            quantity: quantity ?? null,
            unit: unit?.unit ?? null,
            category: category.value ?? 'OTHER',
          });
        }
      });
    }
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  return { from, to, items };
}

export function validateToInventory(input) {
  const errors = [];
  const item = {};

  if (input?.location !== undefined) {
    const location = validateEnum(input.location, INVENTORY_LOCATIONS, 'location', errors);
    if (location.value) {
      item.location = location.value;
    }
  }
  if (input?.category !== undefined) {
    const category = validateEnum(input.category, ITEM_CATEGORIES, 'category', errors);
    if (category.value) {
      item.category = category.value;
    }
  }
  if (input?.expiresAt !== undefined && input.expiresAt !== null && input.expiresAt !== '') {
    const expiresAt = parseDateString(input.expiresAt);
    if (expiresAt === null) {
      errors.push(fieldError('expiresAt', 'Choose a valid YYYY-MM-DD date.'));
    } else {
      item.expiresAt = expiresAt;
    }
  }
  if (input?.quantity !== undefined && input.quantity !== null && input.quantity !== '') {
    item.quantity = validateQuantity(input.quantity, 'quantity', errors, { allowZero: false });
  }
  item.note = validateOptionalText(input?.note, 'note', MAX_ITEM_NOTES, errors) ?? null;

  if (errors.length) {
    throwValidationError(errors);
  }
  return item;
}
