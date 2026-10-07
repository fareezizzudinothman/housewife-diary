import { fieldError } from './shared.js';
import { parseDateString } from './format.js';
import { RECURRENCE_FREQUENCIES } from '../utils/recurrence.js';

const MAX_INTERVAL = 99;

const ALLOWED_KEYS = new Set(['frequency', 'interval', 'daysOfWeek', 'endDate']);

// Validates the structured recurrence rule shared by tasks and calendar
// events: { frequency, interval, daysOfWeek?, endDate? }. Format only — the
// relationship between endDate and the series start date is checked by the
// service, which knows the final start.
export function validateRecurrence(value, { errors, field = 'recurrence' }) {
  if (value === undefined) {
    return { provided: false, recurrence: undefined };
  }
  if (value === null || value === '') {
    return { provided: true, recurrence: null };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    errors.push(fieldError(field, 'Repeat rule must be an object.'));
    return { provided: true, recurrence: null };
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) {
      errors.push(fieldError(field, 'Unsupported repeat option.'));
      return { provided: true, recurrence: null };
    }
  }

  const frequency = value.frequency;
  if (!RECURRENCE_FREQUENCIES.includes(frequency)) {
    errors.push(
      fieldError(field, 'Choose a repeat frequency: daily, weekly, monthly or yearly.'),
    );
    return { provided: true, recurrence: null };
  }

  let interval = 1;
  if (value.interval !== undefined && value.interval !== null && value.interval !== '') {
    const parsed = typeof value.interval === 'number' ? value.interval : Number(value.interval);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_INTERVAL) {
      errors.push(fieldError(field, `Repeat every must be between 1 and ${MAX_INTERVAL}.`));
      return { provided: true, recurrence: null };
    }
    interval = parsed;
  }

  let daysOfWeek;
  if (value.daysOfWeek !== undefined && value.daysOfWeek !== null) {
    if (!Array.isArray(value.daysOfWeek) || value.daysOfWeek.length < 1) {
      errors.push(fieldError(field, 'Choose at least one weekday to repeat on.'));
      return { provided: true, recurrence: null };
    }
    if (value.daysOfWeek.length > 7) {
      errors.push(fieldError(field, 'A weekly repeat can include at most 7 days.'));
      return { provided: true, recurrence: null };
    }
    const days = [];
    for (const raw of value.daysOfWeek) {
      const day = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        errors.push(fieldError(field, 'Weekdays must be numbers from 0 (Sunday) to 6.'));
        return { provided: true, recurrence: null };
      }
      days.push(day);
    }
    if (new Set(days).size !== days.length) {
      errors.push(fieldError(field, 'Choose each weekday at most once.'));
      return { provided: true, recurrence: null };
    }
    if (frequency !== 'WEEKLY') {
      errors.push(fieldError(field, 'Repeat on selected days only applies to weekly repeats.'));
      return { provided: true, recurrence: null };
    }
    daysOfWeek = [...new Set(days)].sort((a, b) => a - b);
  }

  let endDate;
  if (value.endDate !== undefined && value.endDate !== null && value.endDate !== '') {
    if (parseDateString(value.endDate) === null) {
      errors.push(fieldError(field, 'Repeat end date must be a valid YYYY-MM-DD date.'));
      return { provided: true, recurrence: null };
    }
    endDate = value.endDate;
  }

  return {
    provided: true,
    recurrence: {
      frequency,
      interval,
      ...(daysOfWeek ? { daysOfWeek } : {}),
      ...(endDate ? { endDate } : {}),
    },
  };
}
