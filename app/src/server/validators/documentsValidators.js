import { fieldError, throwValidationError } from './shared.js';
import { parseDateString } from './format.js';
import {
  validateEnum,
  validateOptionalLine,
  validateOptionalText,
  validatePageParams,
} from './kitchen.js';
import { validateOptionalId } from './finance.js';

export const MAX_DOCUMENT_TITLE = 120;
export const MAX_DOCUMENT_DESCRIPTION = 500;
export const MAX_DOCUMENT_SEARCH = 120;

export const DOCUMENT_CATEGORIES = Object.freeze([
  'INSURANCE',
  'WARRANTY',
  'RECEIPT',
  'CONTRACT',
  'PROPERTY',
  'SCHOOL',
  'MEDICAL',
  'FINANCIAL',
  'OTHER',
]);
export const DOCUMENT_REFERENCE_TYPES = Object.freeze([
  'MAINTENANCE',
  'FINANCE_TRANSACTION',
  'INVENTORY',
  'FAMILY_MEMBER',
]);
export const DOCUMENT_STATUSES = Object.freeze(['ACTIVE', 'EXPIRING_SOON', 'EXPIRED']);

function optionalDate(value, field, errors) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = parseDateString(value);
  if (parsed === null) {
    errors.push(fieldError(field, 'Date must use YYYY-MM-DD.'));
  }
  return parsed;
}

function referenceFields(input, errors) {
  let referenceType;
  if (input?.referenceType !== undefined) {
    referenceType = validateEnum(input.referenceType, DOCUMENT_REFERENCE_TYPES, 'referenceType', errors)
      .value;
    if (referenceType === undefined) {
      return { referenceType: null, referenceId: null };
    }
  }
  const referenceId = validateOptionalId(input?.referenceId, 'referenceId', errors);
  if (referenceType && referenceId === null) {
    errors.push(fieldError('referenceId', 'Choose a linked record.'));
  }
  if (!referenceType && input?.referenceId !== undefined && input.referenceId !== null && input.referenceId !== '') {
    errors.push(fieldError('referenceType', 'Choose a reference type.'));
  }
  return { referenceType: referenceType ?? null, referenceId: referenceId ?? null };
}

export function validateCreateDocument(input) {
  const errors = [];
  const title = validateOptionalLine(input?.title, 'title', MAX_DOCUMENT_TITLE, errors);
  if (title === undefined || title === null) {
    errors.push(fieldError('title', `Title must be 1-${MAX_DOCUMENT_TITLE} characters.`));
  }
  const description = validateOptionalText(input?.description, 'description', MAX_DOCUMENT_DESCRIPTION, errors);
  const category = validateEnum(input?.category ?? 'OTHER', DOCUMENT_CATEGORIES, 'category', errors).value ?? 'OTHER';
  const expiryDate = optionalDate(input?.expiryDate, 'expiryDate', errors);
  const { referenceType, referenceId } = referenceFields(input, errors);

  if (errors.length) {
    throwValidationError(errors);
  }
  return { title, description, category, expiryDate, referenceType, referenceId };
}

export function validateUpdateDocument(input) {
  const errors = [];
  const patch = {};
  let provided = false;

  if (input?.title !== undefined) {
    provided = true;
    const title = validateOptionalLine(input.title, 'title', MAX_DOCUMENT_TITLE, errors);
    if (title === null) {
      errors.push(fieldError('title', `Title must be 1-${MAX_DOCUMENT_TITLE} characters.`));
    }
    patch.title = title;
  }
  if (input?.description !== undefined) {
    provided = true;
    patch.description = validateOptionalText(input.description, 'description', MAX_DOCUMENT_DESCRIPTION, errors);
  }
  if (input?.category !== undefined) {
    provided = true;
    const category = validateEnum(input.category, DOCUMENT_CATEGORIES, 'category', errors).value;
    if (category !== undefined) {
      patch.category = category;
    }
  }
  if (input?.expiryDate !== undefined) {
    provided = true;
    patch.expiryDate = optionalDate(input.expiryDate, 'expiryDate', errors);
  }
  if (input?.referenceType !== undefined || input?.referenceId !== undefined) {
    provided = true;
    const { referenceType, referenceId } = referenceFields(input, errors);
    patch.referenceType = referenceType;
    patch.referenceId = referenceId;
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  if (!provided) {
    throwValidationError([fieldError('_', 'Provide at least one field to update.')]);
  }
  return patch;
}

export function validateDocumentQuery(input) {
  const errors = [];
  const { page, limit } = validatePageParams(input, errors, { defaultLimit: 24 });
  const search = validateOptionalLine(input?.search, 'search', MAX_DOCUMENT_SEARCH, errors);
  const category = input?.category === undefined ? undefined : validateEnum(input.category, DOCUMENT_CATEGORIES, 'category', errors).value;
  const status = input?.status === undefined ? undefined : validateEnum(input.status, DOCUMENT_STATUSES, 'status', errors).value;
  const referenceType = input?.referenceType === undefined ? undefined : validateEnum(input.referenceType, DOCUMENT_REFERENCE_TYPES, 'referenceType', errors).value;
  if (errors.length) {
    throwValidationError(errors);
  }
  return { page, limit, search, category, status, referenceType };
}