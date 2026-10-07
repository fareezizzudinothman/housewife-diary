import { fieldError, throwValidationError } from './shared.js';
import { parseDateString } from './format.js';
import {
  INVENTORY_EXPIRY_FILTERS,
  INVENTORY_LOCATIONS,
  INVENTORY_STOCK_FILTERS,
  ITEM_CATEGORIES,
  validateEnum,
  validateLookupName,
  validateOptionalText,
  validatePageParams,
  validateQuantity,
  validateUnit,
} from './kitchen.js';

const MAX_NAME = 120;
const MAX_NOTES = 1000;
const MAX_ACTION_NOTE = 300;
const MAX_SEARCH = 100;

function validateExpiresAt(value, errors) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  const parsed = parseDateString(value);
  if (parsed === null) {
    errors.push(fieldError('expiresAt', 'Choose a valid YYYY-MM-DD date.'));
    return null;
  }
  return parsed;
}

export function validateCreateInventory(input) {
  const errors = [];

  const name = validateLookupName(input?.name, 'name', MAX_NAME, errors);
  const quantity = validateQuantity(input?.quantity, 'quantity', errors, {
    min: 0,
    max: 1_000_000,
  });
  const unit = input?.unit === undefined ? { unit: null } : validateUnit(input.unit, errors);
  const category = validateEnum(input?.category, ITEM_CATEGORIES, 'category', errors);
  const location = validateEnum(input?.location, INVENTORY_LOCATIONS, 'location', errors);
  const minimumQuantity = validateQuantity(input?.minimumQuantity, 'minimumQuantity', errors, {
    min: 0,
  });
  const expiresAt = validateExpiresAt(input?.expiresAt, errors);
  const notes = validateOptionalText(input?.notes, 'notes', MAX_NOTES, errors);

  if (errors.length) {
    throwValidationError(errors);
  }

  return {
    name: name?.name,
    normalized: name?.normalized,
    quantity: quantity ?? 0,
    unit: unit?.unit ?? null,
    category: category.value ?? 'OTHER',
    location: location.value ?? 'PANTRY',
    minimumQuantity: minimumQuantity ?? 0,
    expiresAt: expiresAt ?? null,
    notes: notes ?? null,
  };
}

// Quantity is intentionally not patchable: stock changes must go through the
// transaction endpoints so history stays complete (see docs/inventory.md).
export function validateUpdateInventory(input) {
  const errors = [];
  const patch = {};
  let provided = false;

  if (input?.quantity !== undefined) {
    errors.push(
      fieldError('quantity', 'Use consume, waste, add-stock or adjust to change quantity.'),
    );
  }
  if (input?.name !== undefined) {
    provided = true;
    const name = validateLookupName(input.name, 'name', MAX_NAME, errors);
    if (name) {
      patch.name = name.name;
      patch.normalized = name.normalized;
    }
  }
  if (input?.unit !== undefined) {
    provided = true;
    if (input.unit === null || input.unit === '') {
      patch.unit = null;
    } else {
      const unit = validateUnit(input.unit, errors);
      patch.unit = unit?.unit ?? null;
    }
  }
  if (input?.category !== undefined) {
    provided = true;
    const category = validateEnum(input.category, ITEM_CATEGORIES, 'category', errors);
    if (category.value) {
      patch.category = category.value;
    }
  }
  if (input?.location !== undefined) {
    provided = true;
    const location = validateEnum(input.location, INVENTORY_LOCATIONS, 'location', errors);
    if (location.value) {
      patch.location = location.value;
    }
  }
  if (input?.minimumQuantity !== undefined) {
    provided = true;
    const minimum = validateQuantity(input.minimumQuantity, 'minimumQuantity', errors, { min: 0 });
    if (minimum !== null && minimum !== undefined) {
      patch.minimumQuantity = minimum;
    } else if (minimum === undefined) {
      patch.minimumQuantity = 0;
    }
  }
  if (input?.expiresAt !== undefined) {
    provided = true;
    patch.expiresAt = validateExpiresAt(input.expiresAt, errors);
  }
  if (input?.notes !== undefined) {
    provided = true;
    patch.notes = validateOptionalText(input.notes, 'notes', MAX_NOTES, errors);
  }

  if (!provided && input?.quantity === undefined) {
    errors.push(fieldError('body', 'Provide at least one field to update.'));
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return patch;
}

export function validateInventoryQuery(input) {
  const errors = [];
  const query = validatePageParams(input, errors);

  const search = typeof input?.search === 'string' ? input.search.trim() : '';
  if (search.length > MAX_SEARCH) {
    errors.push(fieldError('search', `Search must be at most ${MAX_SEARCH} characters.`));
  } else if (search) {
    query.search = search;
  }

  const category = validateEnum(input?.category, ITEM_CATEGORIES, 'category', errors);
  if (category.value) {
    query.category = category.value;
  }
  const location = validateEnum(input?.location, INVENTORY_LOCATIONS, 'location', errors);
  if (location.value) {
    query.location = location.value;
  }
  const stock = validateEnum(input?.stock, INVENTORY_STOCK_FILTERS, 'stock', errors);
  if (stock.value) {
    query.stock = stock.value;
  }
  const expiry = validateEnum(input?.expiry, INVENTORY_EXPIRY_FILTERS, 'expiry', errors);
  if (expiry.value) {
    query.expiry = expiry.value;
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  return query;
}

function validateActionNote(input, errors) {
  return validateOptionalText(input?.note, 'note', MAX_ACTION_NOTE, errors) ?? null;
}

function validateStockAction(input, errors, { allowZero }) {
  return validateQuantity(input?.quantity, 'quantity', errors, {
    required: true,
    min: 0,
    max: 1_000_000,
    allowZero,
  });
}

export function validateConsume(input) {
  const errors = [];
  const quantity = validateStockAction(input, errors, { allowZero: false });
  const note = validateActionNote(input, errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return { quantity, note };
}

export function validateWaste(input) {
  const errors = [];
  const quantity = validateStockAction(input, errors, { allowZero: false });
  const note = validateActionNote(input, errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return { quantity, note };
}

export function validateAddStock(input) {
  const errors = [];
  const quantity = validateStockAction(input, errors, { allowZero: false });
  const note = validateActionNote(input, errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return { quantity, note };
}

export function validateAdjust(input) {
  const errors = [];
  const quantity = validateStockAction(input, errors, { allowZero: true });
  const note = validateActionNote(input, errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return { quantity, note };
}

export function validateTransactionsQuery(input) {
  const errors = [];
  const query = validatePageParams(input, errors, { defaultLimit: 20, maxLimit: 100 });
  if (errors.length) {
    throwValidationError(errors);
  }
  return query;
}
