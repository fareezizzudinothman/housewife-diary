// Shared validation vocabulary for the kitchen domain (recipes, meals,
// shopping, inventory). Keeping the enums and parsing helpers here means the
// category/unit/quantity rules exist in exactly one place — see docs.
import { fieldError } from './shared.js';
import {
  normalizeLookupName,
  normalizePlainText,
  normalizeSingleLine,
  normalizeUnit,
  parseDecimalQuantity,
} from './format.js';

export const MEAL_TYPES = Object.freeze(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']);

export const ITEM_CATEGORIES = Object.freeze([
  'PRODUCE',
  'MEAT',
  'SEAFOOD',
  'DAIRY',
  'PANTRY',
  'FROZEN',
  'DRINKS',
  'HOUSEHOLD',
  'OTHER',
]);

export const INVENTORY_LOCATIONS = Object.freeze([
  'PANTRY',
  'REFRIGERATOR',
  'FREEZER',
  'HOUSEHOLD',
  'OTHER',
]);

export const INVENTORY_STOCK_FILTERS = Object.freeze([
  'in_stock',
  'low_stock',
  'out_of_stock',
]);

export const INVENTORY_EXPIRY_FILTERS = Object.freeze(['expired', 'expiring_soon', 'none']);

export const MAX_PAGE_LIMIT = 50;
export const MAX_TEXT = 5000;

export function escapeLike(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function parseIntegerParam(value, { min, max, fallback }) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (!/^\d+$/.test(String(value))) {
    return null;
  }
  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : null;
}

// page/limit in the diary/task shape: page ≥ 1, limit 1..maxLimit.
export function validatePageParams(input, errors, { defaultLimit = 20, maxLimit = MAX_PAGE_LIMIT } = {}) {
  const page = parseIntegerParam(input?.page, { min: 1, max: 10_000, fallback: 1 });
  const limit = parseIntegerParam(input?.limit, { min: 1, max: maxLimit, fallback: defaultLimit });
  if (page === null) {
    errors.push(fieldError('page', 'Page must be a positive number.'));
  }
  if (limit === null) {
    errors.push(fieldError('limit', `Limit must be between 1 and ${maxLimit}.`));
  }
  return { page: page ?? 1, limit: limit ?? defaultLimit };
}

// Trimmed single-line name plus its normalized matching key.
export function validateLookupName(value, field, maxLength, errors) {
  const parsed = normalizeLookupName(value, maxLength);
  if (parsed === null) {
    errors.push(fieldError(field, `${label(field)} must be 1-${maxLength} characters.`));
  }
  return parsed;
}

export function validateOptionalLookupName(value, field, maxLength, errors) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return { name: null };
  }
  return validateLookupName(value, field, maxLength, errors);
}

export function validateOptionalInt(value, field, { min, max }, errors) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = parseIntegerParam(value, { min, max, fallback: null });
  if (parsed === null) {
    errors.push(fieldError(field, `${label(field)} must be between ${min} and ${max}.`));
  }
  return parsed;
}

export function validateUnit(value, errors, field = 'unit') {
  const parsed = normalizeUnit(value);
  if (parsed === null) {
    errors.push(fieldError(field, 'Unit must be 1-30 characters.'));
  }
  return parsed;
}

export function validateOptionalText(value, field, maxLength, errors) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  const normalized = normalizePlainText(value, maxLength);
  if (normalized === null) {
    errors.push(fieldError(field, `${label(field)} must be 1-${maxLength} characters.`));
  }
  return normalized;
}

export function validateOptionalLine(value, field, maxLength, errors) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  const normalized = normalizeSingleLine(value, maxLength);
  if (normalized === null) {
    errors.push(fieldError(field, `${label(field)} must be 1-${maxLength} characters.`));
  }
  return normalized;
}

export function validateEnum(value, allowed, field, errors, { required = false } = {}) {
  if (value === undefined) {
    return { value: undefined, provided: false };
  }
  if (value === null || value === '') {
    if (required) {
      errors.push(fieldError(field, `Choose a ${label(field)}.`));
    }
    return { value: undefined, provided: true };
  }
  if (!allowed.includes(value)) {
    errors.push(fieldError(field, `Choose a ${label(field)} from the list.`));
    return { value: undefined, provided: true };
  }
  return { value, provided: true };
}

export function validateBoolean(value, field, errors) {
  if (value === undefined) {
    return { value: undefined, provided: false };
  }
  if (typeof value !== 'boolean') {
    errors.push(fieldError(field, `${label(field)} must be true or false.`));
    return { value: undefined, provided: true };
  }
  return { value, provided: true };
}

// Query-string booleans arrive as 'true'/'false' strings.
export function validateBooleanQuery(value, field, errors) {
  if (value === undefined || value === null || value === '') {
    return { value: undefined, provided: false };
  }
  if (value === true || value === 'true') {
    return { value: true, provided: true };
  }
  if (value === false || value === 'false') {
    return { value: false, provided: true };
  }
  errors.push(fieldError(field, `${label(field)} must be true or false.`));
  return { value: undefined, provided: true };
}

// Quantity (decimal, 3 places). `required` demands a positive-or-zero value;
// otherwise an absent value returns null. A value of 0 is allowed only when
// `allowZero` (default true) so callers can forbid no-op transactions.
export function validateQuantity(
  value,
  field,
  errors,
  { required = false, min = 0, allowZero = true, max = 1_000_000 } = {},
) {
  const absent = value === undefined || value === null || value === '';
  if (absent) {
    if (required) {
      errors.push(fieldError(field, `${label(field)} is required.`));
    }
    return required ? null : undefined;
  }
  const parsed = parseDecimalQuantity(value, { min, max });
  if (parsed === null || (!allowZero && parsed === 0)) {
    const suffix = allowZero ? `${min}-${max}` : `greater than 0 and at most ${max}`;
    errors.push(fieldError(field, `${label(field)} must be ${suffix}.`));
    return null;
  }
  return parsed;
}

function label(field) {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (ch) => ch.toUpperCase())
    .trim();
}
