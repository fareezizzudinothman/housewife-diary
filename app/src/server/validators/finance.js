import { fieldError } from './shared.js';
import { normalizeSingleLine, parseDateString } from './format.js';
import { Decimal, MAX_MONEY } from '../utils/money.js';
import {
  validateBoolean,
  validateBooleanQuery,
  validateEnum,
  validateOptionalText,
  validatePageParams,
} from './kitchen.js';

// Shared finance vocabulary. The generic helpers (enum/boolean/page parsing)
// are reused from the kitchen validator toolkit so rules live in one place.

export const DEFAULT_CURRENCY = 'SGD';

// ISO 4217 allowlist. Adding a currency means adding it here — nothing else
// in the codebase special-cases currency codes.
export const SUPPORTED_CURRENCIES = Object.freeze([
  'SGD',
  'MYR',
  'USD',
  'EUR',
  'GBP',
  'AUD',
  'NZD',
  'IDR',
  'THB',
  'PHP',
  'INR',
  'CNY',
  'JPY',
  'HKD',
]);

export const ACCOUNT_TYPES = Object.freeze(['CASH', 'BANK', 'CREDIT_CARD', 'E_WALLET', 'OTHER']);
export const CATEGORY_TYPES = Object.freeze(['INCOME', 'EXPENSE']);
export const TRANSACTION_TYPES = Object.freeze(['INCOME', 'EXPENSE', 'TRANSFER']);
export const TRANSACTION_STATUSES = Object.freeze(['POSTED', 'VOIDED']);
export const TRANSACTION_STATUS_FILTERS = Object.freeze(['POSTED', 'VOIDED', 'ALL']);
export const SOURCE_TYPES = Object.freeze(['MANUAL', 'BILL', 'RECURRING']);
export const BUDGET_PERIODS = Object.freeze(['MONTHLY']);
export const BILL_STATUSES = Object.freeze(['UPCOMING', 'PAID', 'CANCELLED']);
export const BILL_STATUS_FILTERS = Object.freeze([
  'UPCOMING',
  'DUE',
  'OVERDUE',
  'PAID',
  'CANCELLED',
  'ALL',
]);
export const RECURRENCE_FREQUENCIES = Object.freeze(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

export const MAX_ACCOUNT_NAME = 80;
export const MAX_CATEGORY_NAME = 80;
export const MAX_DESCRIPTION = 200;
export const MAX_MERCHANT = 120;
export const MAX_NOTES = 1000;
export const MAX_VOID_REASON = 300;
export const MAX_BILL_NAME = 120;
export const MAX_ICON = 40;
export const MAX_SEARCH = 100;
export const MAX_INTERVAL = 99;
export const MAX_CATEGORIES_PER_HOUSEHOLD = 100;
export const MAX_ACCOUNTS_PER_HOUSEHOLD = 50;

const ID_PATTERN = /^[a-z0-9_-]{6,64}$/;

// ---- Money ----

// Accepts numbers and numeric strings; rejects NaN/Infinity, more than two
// decimal places, out-of-range magnitudes, and (unless allowed) negatives.
// Returns a canonical 2-decimal string or null.
export function validateMoney(
  value,
  field,
  errors,
  { required = true, positive = false, allowNegative = false } = {},
) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      errors.push(fieldError(field, 'Enter an amount.'));
    }
    return required ? null : undefined;
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    errors.push(fieldError(field, 'Amount must be a number with at most 2 decimals.'));
    return null;
  }

  let parsed;
  try {
    parsed = new Decimal(typeof value === 'string' ? value.trim() : value);
  } catch {
    parsed = null;
  }
  if (!parsed || !parsed.isFinite()) {
    errors.push(fieldError(field, 'Amount must be a finite number.'));
    return null;
  }
  if (parsed.decimalPlaces() > 2) {
    errors.push(fieldError(field, 'Amount can have at most 2 decimal places.'));
    return null;
  }
  if (parsed.gt(MAX_MONEY) || parsed.lt(MAX_MONEY.negated())) {
    errors.push(fieldError(field, 'Amount is out of range.'));
    return null;
  }
  if (positive && parsed.lte(0)) {
    errors.push(fieldError(field, 'Amount must be greater than zero.'));
    return null;
  }
  if (!positive && !allowNegative && parsed.lt(0)) {
    errors.push(fieldError(field, 'Amount cannot be negative.'));
    return null;
  }
  return parsed.toFixed(2);
}

export function validateCurrency(value, field, errors, { required = false, fallback = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required && !fallback) {
      errors.push(fieldError(field, 'Choose a currency.'));
      return null;
    }
    return fallback;
  }
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!SUPPORTED_CURRENCIES.includes(code)) {
    errors.push(fieldError(field, `Choose a supported currency: ${SUPPORTED_CURRENCIES.join(', ')}.`));
    return fallback;
  }
  return code;
}

// ---- Dates, months and ids ----

// Returns a UTC-midnight Date for a YYYY-MM-DD value (matches @db.Date).
export function validateDateValue(value, field, errors, { required = true } = {}) {
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

export function validateYear(value, field, errors, { required = true, fallback = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required && fallback === null) {
      errors.push(fieldError(field, 'Enter a year.'));
      return null;
    }
    return fallback;
  }
  const year = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    errors.push(fieldError(field, 'Year must be between 2000 and 2100.'));
    return fallback;
  }
  return year;
}

export function validateMonth(value, field, errors, { required = true, fallback = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required && fallback === null) {
      errors.push(fieldError(field, 'Enter a month.'));
      return null;
    }
    return fallback;
  }
  const month = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    errors.push(fieldError(field, 'Month must be between 1 and 12.'));
    return fallback;
  }
  return month;
}

export function validateOptionalId(value, field, errors) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    errors.push(fieldError(field, `Choose a valid ${field}.`));
    return null;
  }
  return value;
}

export function validateInterval(value, field, errors) {
  if (value === undefined || value === null || value === '') {
    return 1;
  }
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_INTERVAL) {
    errors.push(fieldError(field, `Repeat every must be between 1 and ${MAX_INTERVAL}.`));
    return null;
  }
  return parsed;
}

export function validateIcon(value, errors) {
  return validateOptionalText(value, 'icon', MAX_ICON, errors);
}

export function trimOptionalLine(value, field, maxLength, errors) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  const parsed = normalizeSingleLine(value, maxLength);
  if (parsed === null) {
    errors.push(fieldError(field, `${field} must be 1-${maxLength} characters.`));
  }
  return parsed;
}

export {
  validateBoolean,
  validateBooleanQuery,
  validateEnum,
  validateOptionalText,
  validatePageParams,
};
