import { fieldError, throwValidationError } from './shared.js';
import { validateOptionalLine, validateOptionalText, validatePageParams } from './kitchen.js';
import { validateEnum } from './kitchen.js';

export const MAX_IDEA_TITLE = 200;
export const MAX_IDEA_DESCRIPTION = 5000;
export const MAX_IDEA_CATEGORY = 100;
export const MAX_IDEA_NOTES = 2000;
export const MAX_IDEA_SEARCH = 100;

export const IDEA_STATUSES = Object.freeze([
  'IDEA',
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

const PRIORITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const MAX_COST_TEXT = '999999999999.99';
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function validateId(value) {
  if (/^[a-zA-Z0-9_-]{1,64}$/.test(String(value))) {
    return String(value);
  }
  return null;
}

function validateCost(value, errors) {
  if (value === undefined) {
    return { value: undefined, provided: false };
  }
  if (value === null || value === '') {
    return { value: null, provided: true };
  }
  const raw = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    errors.push(fieldError('estimatedCost', 'Estimated cost must be a non-negative amount with up to 2 decimals.'));
    return { value: undefined, provided: true };
  }
  const normalized = raw.replace(/^0+(?=\d)/, '');
  if (Number(normalized) > Number(MAX_COST_TEXT)) {
    errors.push(fieldError('estimatedCost', `Estimated cost cannot exceed ${MAX_COST_TEXT}.`));
    return { value: undefined, provided: true };
  }
  return { value: normalized, provided: true };
}

function validateCurrency(value, errors) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  const currency = String(value).trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(currency)) {
    errors.push(fieldError('currency', 'Currency must be a 3-letter code such as SGD.'));
    return undefined;
  }
  return currency;
}

export function validateIdeaId(value) {
  const id = validateId(value);
  if (!id) {
    throwValidationError([fieldError('id', 'Invalid idea id.')]);
  }
  return id;
}

export function validateCreateIdea(input) {
  const errors = [];
  const title = validateOptionalLine(input?.title, 'title', MAX_IDEA_TITLE, errors);
  if (title === null || title === undefined) {
    errors.push(fieldError('title', `Title must be 1-${MAX_IDEA_TITLE} characters.`));
  }
  const description = validateOptionalText(input?.description, 'description', MAX_IDEA_DESCRIPTION, errors);
  const category = validateOptionalLine(input?.category, 'category', MAX_IDEA_CATEGORY, errors);
  const priority = validateEnum(input?.priority ?? 'MEDIUM', PRIORITIES, 'priority', errors).value ?? 'MEDIUM';
  const status = validateEnum(input?.status ?? 'IDEA', IDEA_STATUSES, 'status', errors).value ?? 'IDEA';
  const cost = validateCost(input?.estimatedCost, errors);
  const currency = validateCurrency(input?.currency, errors) ?? 'SGD';
  const notes = validateOptionalText(input?.notes, 'notes', MAX_IDEA_NOTES, errors);
  if (errors.length > 0) {
    throwValidationError(errors);
  }
  return {
    title,
    description: description ?? null,
    category: category ?? null,
    priority,
    status,
    estimatedCost: cost.value ?? null,
    currency: currency ?? 'SGD',
    notes: notes ?? null,
  };
}

export function validateUpdateIdea(input) {
  const errors = [];
  const result = {};
  if (input?.title !== undefined) {
    const title = validateOptionalLine(input.title, 'title', MAX_IDEA_TITLE, errors);
    if (title === null || title === undefined) {
      errors.push(fieldError('title', `Title must be 1-${MAX_IDEA_TITLE} characters.`));
    } else {
      result.title = title;
    }
  }
  if (input?.description !== undefined) {
    result.description = validateOptionalText(input.description, 'description', MAX_IDEA_DESCRIPTION, errors) ?? null;
  }
  if (input?.category !== undefined) {
    const category = validateOptionalLine(input.category, 'category', MAX_IDEA_CATEGORY, errors);
    if (category === undefined) {
      errors.push(fieldError('category', `Category must be 1-${MAX_IDEA_CATEGORY} characters.`));
    } else {
      result.category = category;
    }
  }
  if (input?.priority !== undefined) {
    const parsed = validateEnum(input.priority, PRIORITIES, 'priority', errors);
    if (parsed.value !== undefined) {
      result.priority = parsed.value;
    }
  }
  if (input?.status !== undefined) {
    const parsed = validateEnum(input.status, IDEA_STATUSES, 'status', errors);
    if (parsed.value !== undefined) {
      result.status = parsed.value;
    }
  }
  if (input?.estimatedCost !== undefined) {
    const cost = validateCost(input.estimatedCost, errors);
    if (cost.provided) {
      result.estimatedCost = cost.value ?? null;
    }
  }
  if (input?.currency !== undefined) {
    const currency = validateCurrency(input.currency, errors);
    if (currency !== undefined) {
      result.currency = currency;
    }
  }
  if (input?.notes !== undefined) {
    result.notes = validateOptionalText(input.notes, 'notes', MAX_IDEA_NOTES, errors) ?? null;
  }
  if (Object.keys(result).length === 0 && errors.length === 0) {
    errors.push(fieldError('_', 'Provide at least one field to update.'));
  }
  if (errors.length > 0) {
    throwValidationError(errors);
  }
  return result;
}

export function validateIdeaQuery(input) {
  const errors = [];
  const { page, limit } = validatePageParams(input, errors, { defaultLimit: 20 });
  const search = validateOptionalLine(input?.search, 'search', MAX_IDEA_SEARCH, errors);
  const category = validateOptionalLine(input?.category, 'category', MAX_IDEA_CATEGORY, errors);
  const status = input?.status === undefined ? undefined : validateEnum(input.status, IDEA_STATUSES, 'status', errors).value;
  if (errors.length > 0) {
    throwValidationError(errors);
  }
  return { page, limit, search, category, status };
}