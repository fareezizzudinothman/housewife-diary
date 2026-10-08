import { fieldError, throwValidationError } from './shared.js';
import { parseDateString } from './format.js';
import {
  validateBoolean,
  validateBooleanQuery,
  validateOptionalLine,
  validateOptionalText,
  validatePageParams,
} from './kitchen.js';
import { validateOptionalId } from './finance.js';

export const MAX_FAMILY_NAME = 80;
export const MAX_RELATIONSHIP = 40;
export const MAX_FAMILY_NOTES = 1000;
export const MAX_EVENT_TITLE = 120;
export const MAX_EVENT_KIND = 40;
export const MAX_EVENT_NOTES = 1000;

function validateName(value, errors) {
  const name = validateOptionalLine(value, 'name', MAX_FAMILY_NAME, errors);
  if (name === null) {
    errors.push(fieldError('name', `Name must be 1-${MAX_FAMILY_NAME} characters.`));
  }
  return name;
}

function validateRelationship(value, errors) {
  const relationship = validateOptionalLine(value, 'relationship', MAX_RELATIONSHIP, errors);
  if (relationship === null || relationship === undefined) {
    errors.push(fieldError('relationship', `Relationship must be 1-${MAX_RELATIONSHIP} characters.`));
  }
  return relationship;
}

export function validateCreateFamilyMember(input) {
  const errors = [];
  const name = validateName(input?.name, errors);
  const relationship = validateRelationship(input?.relationship, errors);
  const linkedUserId = validateOptionalId(input?.linkedUserId, 'linkedUserId', errors);
  const dateOfBirth =
    input?.dateOfBirth === undefined || input.dateOfBirth === null || input.dateOfBirth === ''
      ? null
      : parseDateString(input.dateOfBirth);
  if (input?.dateOfBirth && dateOfBirth === null) {
    errors.push(fieldError('dateOfBirth', 'Date of birth must use YYYY-MM-DD.'));
  }
  const notes = validateOptionalText(input?.notes, 'notes', MAX_FAMILY_NOTES, errors);

  if (errors.length) {
    throwValidationError(errors);
  }

  return { name, relationship, linkedUserId, dateOfBirth, notes };
}

export function validateUpdateFamilyMember(input) {
  const errors = [];
  const patch = {};
  let provided = false;

  if (input?.name !== undefined) {
    provided = true;
    patch.name = validateName(input.name, errors);
  }
  if (input?.relationship !== undefined) {
    provided = true;
    patch.relationship = validateRelationship(input.relationship, errors);
  }
  if (input?.linkedUserId !== undefined) {
    provided = true;
    patch.linkedUserId = validateOptionalId(input.linkedUserId, 'linkedUserId', errors);
  }
  if (input?.dateOfBirth !== undefined) {
    provided = true;
    patch.dateOfBirth =
      input.dateOfBirth === null || input.dateOfBirth === ''
        ? null
        : parseDateString(input.dateOfBirth);
    if (input.dateOfBirth && patch.dateOfBirth === null) {
      errors.push(fieldError('dateOfBirth', 'Date of birth must use YYYY-MM-DD.'));
    }
  }
  if (input?.notes !== undefined) {
    provided = true;
    patch.notes = validateOptionalText(input.notes, 'notes', MAX_FAMILY_NOTES, errors);
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

export function validateFamilyMemberQuery(input) {
  const errors = [];
  const { page, limit } = validatePageParams(input, errors, { defaultLimit: 24 });
  const search = validateOptionalLine(input?.search, 'search', MAX_FAMILY_NAME, errors);
  const includeArchived = validateBooleanQuery(input?.includeArchived, 'includeArchived', errors).value;

  if (errors.length) {
    throwValidationError(errors);
  }

  return { page, limit, search, includeArchived };
}

function validateEventDate(value, errors) {
  if (value === undefined || value === null || value === '') {
    errors.push(fieldError('eventDate', 'Event date is required.'));
    return null;
  }
  const parsed = parseDateString(value);
  if (parsed === null) {
    errors.push(fieldError('eventDate', 'Event date must use YYYY-MM-DD.'));
    return null;
  }
  return parsed;
}

export function validateCreateFamilyEvent(input) {
  const errors = [];

  const title = validateOptionalLine(input?.title, 'title', MAX_EVENT_TITLE, errors);
  if (title === null) {
    errors.push(fieldError('title', `Title must be 1-${MAX_EVENT_TITLE} characters.`));
  }
  const kind = validateOptionalLine(input?.kind, 'kind', MAX_EVENT_KIND, errors);
  if (kind === null || kind === undefined) {
    errors.push(fieldError('kind', `Kind must be 1-${MAX_EVENT_KIND} characters.`));
  }
  const eventDate = validateEventDate(input?.eventDate, errors);
  const memberId = validateOptionalId(input?.memberId, 'memberId', errors);
  const repeatsYearly = validateBoolean(input?.repeatsYearly, 'repeatsYearly', errors).value;
  const notes = validateOptionalText(input?.notes, 'notes', MAX_EVENT_NOTES, errors);

  if (errors.length) {
    throwValidationError(errors);
  }

  return { title, kind, eventDate, memberId, repeatsYearly: repeatsYearly ?? false, notes };
}

export function validateUpdateFamilyEvent(input) {
  const errors = [];
  const patch = {};
  let provided = false;

  if (input?.title !== undefined) {
    provided = true;
    const title = validateOptionalLine(input.title, 'title', MAX_EVENT_TITLE, errors);
    if (title === null) {
      errors.push(fieldError('title', `Title must be 1-${MAX_EVENT_TITLE} characters.`));
    } else {
      patch.title = title;
    }
  }
  if (input?.kind !== undefined) {
    provided = true;
    const kind = validateOptionalLine(input.kind, 'kind', MAX_EVENT_KIND, errors);
    if (kind === null) {
      errors.push(fieldError('kind', `Kind must be 1-${MAX_EVENT_KIND} characters.`));
    } else {
      patch.kind = kind;
    }
  }
  if (input?.eventDate !== undefined) {
    provided = true;
    const eventDate = validateEventDate(input.eventDate, errors);
    if (eventDate) {
      patch.eventDate = eventDate;
    }
  }
  if (input?.memberId !== undefined) {
    provided = true;
    patch.memberId = validateOptionalId(input.memberId, 'memberId', errors);
  }
  if (input?.repeatsYearly !== undefined) {
    provided = true;
    patch.repeatsYearly = validateBoolean(input.repeatsYearly, 'repeatsYearly', errors).value;
  }
  if (input?.notes !== undefined) {
    provided = true;
    patch.notes = validateOptionalText(input.notes, 'notes', MAX_EVENT_NOTES, errors);
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  if (!provided) {
    throwValidationError([fieldError('_', 'Provide at least one field to update.')]);
  }

  return patch;
}

export function validateFamilyEventQuery(input) {
  const errors = [];
  const { page, limit } = validatePageParams(input, errors, { defaultLimit: 24, maxLimit: 100 });
  const from = validateOptionalDate(input?.from, 'from', errors);
  const to = validateOptionalDate(input?.to, 'to', errors);
  const memberId = validateOptionalId(input?.memberId, 'memberId', errors);

  if (errors.length) {
    throwValidationError(errors);
  }
  if (from && to && from > to) {
    throwValidationError([fieldError('to', '"to" must be on or after "from".')]);
  }

  return { page, limit, from, to, memberId };
}

function validateOptionalDate(value, field, errors) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = parseDateString(value);
  if (parsed === null) {
    errors.push(fieldError(field, `${field} must use YYYY-MM-DD.`));
    return null;
  }
  return parsed;
}