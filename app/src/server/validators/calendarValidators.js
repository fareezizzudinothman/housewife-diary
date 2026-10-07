import { fieldError, throwValidationError } from './shared.js';
import {
  normalizePlainText,
  normalizeSingleLine,
  parseDateString,
  parseIsoDateTime,
} from './format.js';
import { validateRecurrence } from './recurrence.js';

export const CALENDAR_CATEGORIES = Object.freeze([
  'GENERAL',
  'FAMILY',
  'HOME',
  'HEALTH',
  'WORK',
  'OTHER',
]);

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;
const MAX_LOCATION = 200;
const MAX_REMINDER_MINUTES = 40320; // four weeks

const ALLOWED_REMINDER_KEYS = new Set(['offsetMinutes', 'enabled']);

function validateDescription(value, errors) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const description = normalizePlainText(value, MAX_DESCRIPTION);
  if (description === null) {
    errors.push(fieldError('description', `Description must be 1-${MAX_DESCRIPTION} characters.`));
  }
  return description;
}

function validateCategory(value, errors) {
  if (value === undefined) {
    return undefined;
  }
  if (!CALENDAR_CATEGORIES.includes(value)) {
    errors.push(fieldError('category', 'Choose an event category from the list.'));
    return undefined;
  }
  return value;
}

function validateLocation(value, errors) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const location = normalizeSingleLine(value, MAX_LOCATION);
  if (location === null) {
    errors.push(fieldError('location', `Location must be 1-${MAX_LOCATION} characters.`));
  }
  return location;
}

function validateReminder(value, errors) {
  if (value === undefined) {
    return { reminder: null, provided: false };
  }
  if (value === null || value === '') {
    // Explicit null clears an existing reminder on PATCH.
    return { reminder: null, provided: true };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    errors.push(fieldError('reminder', 'Reminder must be an object with offsetMinutes.'));
    return { reminder: null, provided: true };
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_REMINDER_KEYS.has(key)) {
      errors.push(fieldError('reminder', 'Unsupported reminder option.'));
      return { reminder: null, provided: true };
    }
  }
  const offset = value.offsetMinutes;
  const parsed = typeof offset === 'number' ? offset : Number(offset);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_REMINDER_MINUTES) {
    errors.push(
      fieldError('reminder', `Reminder time must be 0-${MAX_REMINDER_MINUTES} minutes before.`),
    );
    return { reminder: null, provided: true };
  }
  const enabled = value.enabled === undefined ? true : Boolean(value.enabled);
  return { reminder: { offsetMinutes: parsed, enabled }, provided: true };
}

// Start/end parsing. allDay true expects YYYY-MM-DD (stored as the UTC
// midnight of that day); false expects an ISO instant. When allDay is
// undefined (update without an explicit change) either format is accepted
// and the implied kind is returned for the service to reconcile.
function parseInstant(value, allDay, field, errors) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (allDay === true) {
    const date = parseDateString(value);
    if (date === null) {
      errors.push(fieldError(field, `${field === 'start' ? 'Start' : 'End'} must be a valid YYYY-MM-DD date.`));
      return undefined;
    }
    return { allDay: true, date: value, at: date };
  }
  if (allDay === false) {
    const at = parseIsoDateTime(value);
    if (at === null) {
      errors.push(fieldError(field, `${field === 'start' ? 'Start' : 'End'} must be a valid date and time.`));
      return undefined;
    }
    return { allDay: false, at };
  }
  const date = parseDateString(value);
  if (date !== null) {
    return { allDay: true, date: value, at: date };
  }
  const at = parseIsoDateTime(value);
  if (at === null) {
    errors.push(
      fieldError(field, `${field === 'start' ? 'Start' : 'End'} must be a valid date or date and time.`),
    );
    return undefined;
  }
  return { allDay: false, at };
}

export function validateCreateEvent(input) {
  const errors = [];

  const title = normalizeSingleLine(input?.title, MAX_TITLE);
  if (title === null) {
    errors.push(fieldError('title', `Title must be 1-${MAX_TITLE} characters.`));
  }

  const description = validateDescription(input?.description, errors);

  let allDay = false;
  if (input?.allDay !== undefined) {
    if (typeof input.allDay !== 'boolean') {
      errors.push(fieldError('allDay', 'All-day must be true or false.'));
    } else {
      allDay = input.allDay;
    }
  }

  const start = parseInstant(input?.start, allDay, 'start', errors);
  if (input?.start === undefined || input?.start === null || input?.start === '') {
    errors.push(fieldError('start', 'Choose a start.'));
  }
  if (start === undefined) {
    // Parse already reported a specific message.
  }

  let end;
  if (input?.end !== undefined && input?.end !== null && input?.end !== '') {
    end = parseInstant(input.end, allDay, 'end', errors);
  }

  if (start && end) {
    if (allDay) {
      if (end.date < start.date) {
        errors.push(fieldError('end', 'End must be on or after the start.'));
        end = undefined;
      }
    } else if (end.at.getTime() < start.at.getTime()) {
      errors.push(fieldError('end', 'End must be on or after the start.'));
      end = undefined;
    }
  }

  const category = validateCategory(input?.category, errors);
  const location = validateLocation(input?.location, errors);
  const reminder = validateReminder(input?.reminder, errors);
  const recurrence = validateRecurrence(input?.recurrence, { errors });

  if (errors.length) {
    throwValidationError(errors);
  }

  const startAt = start.at;
  const endAt = end ? end.at : startAt;

  return {
    title,
    description,
    allDay,
    startAt,
    endAt,
    category: category ?? 'GENERAL',
    location,
    reminder: reminder.reminder ?? null,
    recurrence: recurrence.recurrence ?? null,
  };
}

export function validateUpdateEvent(input) {
  const errors = [];
  const patch = {};
  let provided = false;

  if (input?.title !== undefined) {
    provided = true;
    const title = normalizeSingleLine(input.title, MAX_TITLE);
    if (title === null) {
      errors.push(fieldError('title', `Title must be 1-${MAX_TITLE} characters.`));
    } else {
      patch.title = title;
    }
  }

  if (input?.description !== undefined) {
    provided = true;
    patch.description = validateDescription(input.description, errors);
  }

  if (input?.allDay !== undefined) {
    provided = true;
    if (typeof input.allDay !== 'boolean') {
      errors.push(fieldError('allDay', 'All-day must be true or false.'));
    } else {
      patch.allDay = input.allDay;
    }
  }

  const impliedAllDay =
    patch.allDay !== undefined
      ? patch.allDay
      : input?.start !== undefined && input.start !== null && input.start !== ''
        ? undefined // resolved by the service against the existing event
        : undefined;

  if (input?.start !== undefined) {
    provided = true;
    const start = parseInstant(input.start, impliedAllDay, 'start', errors);
    if (start !== undefined) {
      patch.start = start;
    }
  }

  if (input?.end !== undefined) {
    provided = true;
    if (input.end === null || input.end === '') {
      errors.push(fieldError('end', 'End must be a valid date or date and time.'));
    } else {
      const end = parseInstant(input.end, impliedAllDay, 'end', errors);
      if (end !== undefined) {
        patch.end = end;
      }
    }
  }

  if (patch.start && patch.end) {
    if (patch.start.allDay && patch.end.allDay) {
      if (patch.end.date < patch.start.date) {
        errors.push(fieldError('end', 'End must be on or after the start.'));
        delete patch.end;
      }
    } else if (!patch.start.allDay && !patch.end.allDay) {
      if (patch.end.at.getTime() < patch.start.at.getTime()) {
        errors.push(fieldError('end', 'End must be on or after the start.'));
        delete patch.end;
      }
    } else {
      errors.push(fieldError('end', 'Start and end must use the same date format.'));
      delete patch.end;
    }
  }

  if (input?.category !== undefined) {
    provided = true;
    const category = validateCategory(input.category, errors);
    if (category !== undefined) {
      patch.category = category;
    }
  }

  if (input?.location !== undefined) {
    provided = true;
    patch.location = validateLocation(input.location, errors);
  }

  if (input?.reminder !== undefined) {
    provided = true;
    const reminder = validateReminder(input.reminder, errors);
    if (reminder.provided) {
      patch.reminder = reminder.reminder;
    }
  }

  if (input?.recurrence !== undefined) {
    provided = true;
    const recurrence = validateRecurrence(input.recurrence, { errors });
    if (recurrence.provided) {
      patch.recurrence = recurrence.recurrence ?? null;
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

export function validateListCalendarQuery(input) {
  const errors = [];
  const query = {};

  if (input?.from !== undefined && input.from !== null && input.from !== '') {
    const from = parseDateString(input.from);
    if (from === null) {
      errors.push(fieldError('from', 'From must be a valid YYYY-MM-DD date.'));
    } else {
      query.from = from;
    }
  }

  if (input?.to !== undefined && input.to !== null && input.to !== '') {
    const to = parseDateString(input.to);
    if (to === null) {
      errors.push(fieldError('to', 'To must be a valid YYYY-MM-DD date.'));
    } else {
      query.to = to;
    }
  }

  if (errors.length) {
    throwValidationError(errors);
  }

  return query;
}
