import { fieldError, isValidTimezone, throwValidationError, trimString } from './shared.js';

export function validateUpdateProfile(input) {
  const errors = [];
  const updates = {};

  if (input?.name !== undefined) {
    const name = trimString(input.name);
    if (!name || name.length > 80) {
      errors.push(fieldError('name', 'Name must be between 1 and 80 characters.'));
    } else {
      updates.name = name;
    }
  }

  if (input?.timezone !== undefined) {
    if (!isValidTimezone(input.timezone)) {
      errors.push(fieldError('timezone', 'Unknown timezone.'));
    } else {
      updates.timezone = input.timezone;
    }
  }

  if (input?.activeHouseholdId !== undefined) {
    const activeHouseholdId = trimString(input.activeHouseholdId);
    if (!activeHouseholdId || activeHouseholdId.length > 64) {
      errors.push(fieldError('activeHouseholdId', 'Invalid household id.'));
    } else {
      updates.activeHouseholdId = activeHouseholdId;
    }
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  return updates;
}
