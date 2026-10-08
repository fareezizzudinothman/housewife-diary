import { fieldError, throwValidationError } from './shared.js';
import { validatePageParams } from './kitchen.js';

export const NOTIFICATION_TYPES = Object.freeze([
  'TASK_DUE',
  'TASK_OVERDUE',
  'BILL_DUE',
  'BILL_OVERDUE',
  'INVENTORY_EXPIRING',
  'INVENTORY_EXPIRED',
  'DOCUMENT_EXPIRING',
  'DOCUMENT_EXPIRED',
  'FAMILY_BIRTHDAY',
  'MAINTENANCE_DUE',
]);

export function validateNotificationQuery(input) {
  const errors = [];
  const { page, limit } = validatePageParams(input, errors, { defaultLimit: 20, maxLimit: 100 });

  const unreadOnly = input?.unreadOnly === undefined
    ? undefined
    : input.unreadOnly === 'true';

  const includeArchived = input?.includeArchived === undefined
    ? undefined
    : input.includeArchived === 'true';

  if (errors.length) {
    throwValidationError(errors);
  }

  return { page, limit, unreadOnly, includeArchived };
}

export function validateNotificationId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) {
    throwValidationError([fieldError('id', 'Invalid notification id.')]);
  }
  return value;
}