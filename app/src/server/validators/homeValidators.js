import { fieldError, throwValidationError } from './shared.js';
import { parseDateString } from './format.js';
import {
  validateBoolean,
  validateBooleanQuery,
  validateEnum,
  validateOptionalInt,
  validateOptionalLine,
  validateOptionalText,
  validatePageParams,
} from './kitchen.js';
import { validateOptionalId } from './finance.js';
import { TASK_PRIORITIES } from './taskValidators.js';

export const MAX_ROOM_NAME = 80;
export const MAX_ROOM_DESCRIPTION = 500;
export const MAX_CLEANING_TITLE = 120;
export const MAX_CLEANING_NOTES = 1000;
export const MAX_LAUNDRY_CATEGORY = 40;
export const MAX_LAUNDRY_NOTES = 500;
export const MAX_MAINTENANCE_TITLE = 120;
export const MAX_MAINTENANCE_CATEGORY = 40;
export const MAX_MAINTENANCE_DESCRIPTION = 2000;
export const MAX_MAINTENANCE_NOTES = 2000;
export const MAX_CLEANING_INTERVAL = 99;

export const CLEANING_FREQUENCIES = Object.freeze(['DAILY', 'WEEKLY', 'MONTHLY']);
export const CLEANING_STATUSES = Object.freeze(['ACTIVE', 'PAUSED']);
export const LAUNDRY_STATUSES = Object.freeze(['PENDING', 'WASHING', 'DRYING', 'FOLDED', 'COMPLETED']);
export const MAINTENANCE_STATUSES = Object.freeze(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

function requiredLine(value, field, maxLength, errors) {
  const line = validateOptionalLine(value, field, maxLength, errors);
  if (line === undefined || line === null) {
    errors.push(fieldError(field, `${field} must be 1-${maxLength} characters.`));
  }
  return line;
}

function requiredDate(value, field, errors) {
  const parsed = parseDateString(value);
  if (parsed === null) {
    errors.push(fieldError(field, 'Date must use YYYY-MM-DD.'));
  }
  return parsed;
}

export function validateCreateRoom(input) {
  const errors = [];
  const name = requiredLine(input?.name, 'name', MAX_ROOM_NAME, errors);
  const description = validateOptionalText(input?.description, 'description', MAX_ROOM_DESCRIPTION, errors);

  if (errors.length) {
    throwValidationError(errors);
  }
  return { name, description };
}

export function validateUpdateRoom(input) {
  const errors = [];
  const patch = {};
  let provided = false;

  if (input?.name !== undefined) {
    provided = true;
    patch.name = requiredLine(input.name, 'name', MAX_ROOM_NAME, errors);
  }
  if (input?.description !== undefined) {
    provided = true;
    patch.description = validateOptionalText(input.description, 'description', MAX_ROOM_DESCRIPTION, errors);
  }
  if (input?.active !== undefined) {
    provided = true;
    patch.active = validateBoolean(input.active, 'active', errors).value;
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  if (!provided) {
    throwValidationError([fieldError('_', 'Provide at least one field to update.')]);
  }
  return patch;
}

export function validateRoomQuery(input) {
  const errors = [];
  const { page, limit } = validatePageParams(input, errors, { defaultLimit: 24 });
  const search = validateOptionalLine(input?.search, 'search', MAX_ROOM_NAME, errors);
  const active = validateBooleanQuery(input?.active, 'active', errors).value;
  if (errors.length) {
    throwValidationError(errors);
  }
  return { page, limit, search, active };
}

export function validateCreateCleaning(input) {
  const errors = [];
  const roomId = validateOptionalId(input?.roomId, 'roomId', errors);
  if (input?.roomId && roomId === null) {
    errors.push(fieldError('roomId', 'Choose a room.'));
  }
  if (roomId === undefined) {
    errors.push(fieldError('roomId', 'Choose a room.'));
  }
  const title = requiredLine(input?.title, 'title', MAX_CLEANING_TITLE, errors);

  let frequency;
  if (input?.frequency === undefined) {
    errors.push(fieldError('frequency', 'Choose a cleaning frequency.'));
  } else {
    const parsed = validateEnum(input.frequency, CLEANING_FREQUENCIES, 'frequency', errors, { required: true });
    frequency = parsed.value;
  }
  const interval = validateOptionalInt(input?.interval, 'interval', { min: 1, max: MAX_CLEANING_INTERVAL }, errors);
  const status = validateEnum(input?.status ?? 'ACTIVE', CLEANING_STATUSES, 'status', errors).value ?? 'ACTIVE';
  const assignedFamilyMemberId = validateOptionalId(input?.assignedFamilyMemberId, 'assignedFamilyMemberId', errors);
  const notes = validateOptionalText(input?.notes, 'notes', MAX_CLEANING_NOTES, errors);

  if (errors.length) {
    throwValidationError(errors);
  }
  return {
    roomId,
    title,
    frequency,
    interval: interval ?? 1,
    status,
    assignedFamilyMemberId,
    notes,
  };
}

export function validateUpdateCleaning(input) {
  const errors = [];
  const patch = {};
  let provided = false;

  if (input?.roomId !== undefined) {
    provided = true;
    const roomId = validateOptionalId(input.roomId, 'roomId', errors);
    if (roomId === null || roomId === undefined) {
      errors.push(fieldError('roomId', 'Choose a room.'));
    } else {
      patch.roomId = roomId;
    }
  }
  if (input?.title !== undefined) {
    provided = true;
    patch.title = requiredLine(input.title, 'title', MAX_CLEANING_TITLE, errors);
  }
  if (input?.frequency !== undefined) {
    provided = true;
    patch.frequency = validateEnum(input.frequency, CLEANING_FREQUENCIES, 'frequency', errors, { required: true }).value;
  }
  if (input?.interval !== undefined) {
    provided = true;
    patch.interval = validateOptionalInt(input.interval, 'interval', { min: 1, max: MAX_CLEANING_INTERVAL }, errors);
  }
  if (input?.status !== undefined) {
    provided = true;
    patch.status = validateEnum(input.status, CLEANING_STATUSES, 'status', errors, { required: true }).value;
  }
  if (input?.assignedFamilyMemberId !== undefined) {
    provided = true;
    patch.assignedFamilyMemberId = validateOptionalId(input.assignedFamilyMemberId, 'assignedFamilyMemberId', errors);
  }
  if (input?.notes !== undefined) {
    provided = true;
    patch.notes = validateOptionalText(input.notes, 'notes', MAX_CLEANING_NOTES, errors);
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  if (!provided) {
    throwValidationError([fieldError('_', 'Provide at least one field to update.')]);
  }
  return patch;
}

export function validateCleaningQuery(input) {
  const errors = [];
  const { page, limit } = validatePageParams(input, errors, { defaultLimit: 24 });
  const status = input?.status === undefined ? undefined : validateEnum(input.status, CLEANING_STATUSES, 'status', errors).value;
  const roomId = input?.roomId === undefined ? undefined : validateOptionalId(input.roomId, 'roomId', errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return { page, limit, status, roomId };
}

export function validateCreateLaundry(input) {
  const errors = [];
  const category = requiredLine(input?.category, 'category', MAX_LAUNDRY_CATEGORY, errors);
  const scheduledDate = optionalDate(input?.scheduledDate, 'scheduledDate', errors);
  const notes = validateOptionalText(input?.notes, 'notes', MAX_LAUNDRY_NOTES, errors);

  if (errors.length) {
    throwValidationError(errors);
  }
  return { category, scheduledDate, notes };
}

export function validateUpdateLaundry(input) {
  const errors = [];
  const patch = {};
  let provided = false;

  if (input?.category !== undefined) {
    provided = true;
    patch.category = requiredLine(input.category, 'category', MAX_LAUNDRY_CATEGORY, errors);
  }
  if (input?.status !== undefined) {
    provided = true;
    patch.status = validateEnum(input.status, LAUNDRY_STATUSES, 'status', errors, { required: true }).value;
  }
  if (input?.scheduledDate !== undefined) {
    provided = true;
    patch.scheduledDate = optionalDate(input.scheduledDate, 'scheduledDate', errors);
  }
  if (input?.notes !== undefined) {
    provided = true;
    patch.notes = validateOptionalText(input.notes, 'notes', MAX_LAUNDRY_NOTES, errors);
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  if (!provided) {
    throwValidationError([fieldError('_', 'Provide at least one field to update.')]);
  }
  return patch;
}

export function validateLaundryQuery(input) {
  const errors = [];
  const { page, limit } = validatePageParams(input, errors, { defaultLimit: 24 });
  const status = input?.status === undefined ? undefined : validateEnum(input.status, LAUNDRY_STATUSES, 'status', errors).value;
  const category = input?.category === undefined ? undefined : validateOptionalLine(input.category, 'category', MAX_LAUNDRY_CATEGORY, errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return { page, limit, status, category };
}

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

function optionalPriority(value, errors) {
  if (value === undefined) {
    return undefined;
  }
  return validateEnum(value, TASK_PRIORITIES, 'priority', errors, { required: true }).value;
}

export function validateCreateMaintenance(input) {
  const errors = [];
  const title = requiredLine(input?.title, 'title', MAX_MAINTENANCE_TITLE, errors);
  const category = requiredLine(input?.category, 'category', MAX_MAINTENANCE_CATEGORY, errors);
  let scheduledDate;
  if (input?.scheduledDate === undefined || input.scheduledDate === null || input.scheduledDate === '') {
    errors.push(fieldError('scheduledDate', 'Scheduled date is required.'));
  } else {
    scheduledDate = requiredDate(input.scheduledDate, 'scheduledDate', errors);
  }
  const priority = optionalPriority(input?.priority, errors) ?? 'MEDIUM';
  const status = validateEnum(input?.status ?? 'OPEN', MAINTENANCE_STATUSES, 'status', errors).value ?? 'OPEN';
  const roomId = input?.roomId === undefined ? null : validateOptionalId(input.roomId, 'roomId', errors);
  const description = validateOptionalText(input?.description, 'description', MAX_MAINTENANCE_DESCRIPTION, errors);
  const transactionId = input?.transactionId === undefined ? null : validateOptionalId(input.transactionId, 'transactionId', errors);
  const notes = validateOptionalText(input?.notes, 'notes', MAX_MAINTENANCE_NOTES, errors);

  if (errors.length) {
    throwValidationError(errors);
  }
  return {
    title,
    category,
    scheduledDate,
    priority,
    status,
    roomId,
    description,
    transactionId,
    notes,
  };
}

export function validateUpdateMaintenance(input) {
  const errors = [];
  const patch = {};
  let provided = false;

  const apply = (key, value) => {
    provided = true;
    patch[key] = value;
  };

  if (input?.title !== undefined) {
    apply('title', requiredLine(input.title, 'title', MAX_MAINTENANCE_TITLE, errors));
  }
  if (input?.category !== undefined) {
    apply('category', requiredLine(input.category, 'category', MAX_MAINTENANCE_CATEGORY, errors));
  }
  if (input?.priority !== undefined) {
    apply('priority', optionalPriority(input.priority, errors));
  }
  if (input?.status !== undefined) {
    apply('status', validateEnum(input.status, MAINTENANCE_STATUSES, 'status', errors, { required: true }).value);
  }
  if (input?.scheduledDate !== undefined) {
    apply('scheduledDate', requiredDate(input.scheduledDate, 'scheduledDate', errors));
  }
  if (input?.roomId !== undefined) {
    apply('roomId', validateOptionalId(input.roomId, 'roomId', errors));
  }
  if (input?.description !== undefined) {
    apply('description', validateOptionalText(input.description, 'description', MAX_MAINTENANCE_DESCRIPTION, errors));
  }
  if (input?.transactionId !== undefined) {
    apply('transactionId', validateOptionalId(input.transactionId, 'transactionId', errors));
  }
  if (input?.notes !== undefined) {
    apply('notes', validateOptionalText(input.notes, 'notes', MAX_MAINTENANCE_NOTES, errors));
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  if (!provided) {
    throwValidationError([fieldError('_', 'Provide at least one field to update.')]);
  }
  return patch;
}

export function validateMaintenanceQuery(input) {
  const errors = [];
  const { page, limit } = validatePageParams(input, errors, { defaultLimit: 24 });
  const status = input?.status === undefined ? undefined : validateEnum(input.status, MAINTENANCE_STATUSES, 'status', errors).value;
  const roomId = input?.roomId === undefined ? undefined : validateOptionalId(input.roomId, 'roomId', errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return { page, limit, status, roomId };
}