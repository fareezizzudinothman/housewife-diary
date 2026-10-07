import { fieldError, throwValidationError } from './shared.js';
import {
  normalizePlainText,
  normalizeSingleLine,
  parseDateString,
  parseIsoDateTime,
} from './format.js';
import { validateRecurrence } from './recurrence.js';

export const TASK_STATUSES = Object.freeze(['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export const TASK_PRIORITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const TASK_VIEWS = Object.freeze(['today', 'upcoming', 'overdue', 'completed', 'all']);
export const TASK_SORTS = Object.freeze(['due', 'priority', 'created']);

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;
const MAX_SEARCH = 100;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

// Cuid-like ids used for category/assignee references.
const ID_PATTERN = /^[a-z0-9]{10,64}$/;

// Due dates arrive either as a bare date (interpreted as end of day in the
// user's timezone by the service) or as a full ISO instant.
function validateDue(value, errors) {
  if (value === undefined || value === null || value === '') {
    return { dueAt: null, dueDate: null };
  }
  const dateOnly = parseDateString(value);
  if (dateOnly !== null) {
    return { dueAt: null, dueDate: value };
  }
  const instant = parseIsoDateTime(value);
  if (instant !== null) {
    return { dueAt: instant, dueDate: null };
  }
  errors.push(fieldError('dueAt', 'Due date must be a valid date or date and time.'));
  return { dueAt: null, dueDate: null };
}

function validateOptionalId(value, field, errors) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    errors.push(fieldError(field, 'Choose a valid option.'));
    return null;
  }
  return value;
}

function validateStatus(value, errors) {
  if (value === undefined) {
    return { status: undefined, provided: false };
  }
  if (!TASK_STATUSES.includes(value)) {
    errors.push(fieldError('status', 'Choose a status from the list.'));
    return { status: undefined, provided: true };
  }
  return { status: value, provided: true };
}

function validatePriority(value, errors) {
  if (value === undefined) {
    return { priority: undefined, provided: false };
  }
  if (!TASK_PRIORITIES.includes(value)) {
    errors.push(fieldError('priority', 'Choose a priority from the list.'));
    return { priority: undefined, provided: true };
  }
  return { priority: value, provided: true };
}

function parseIntegerParam(value, { min, max, fallback }) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (!/^\d+$/.test(String(value))) {
    return null;
  }
  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : null;
}

export function validateCreateTask(input) {
  const errors = [];

  const title = normalizeSingleLine(input?.title, MAX_TITLE);
  if (title === null) {
    errors.push(fieldError('title', `Title must be 1-${MAX_TITLE} characters.`));
  }

  let description = null;
  if (input?.description !== undefined && input.description !== null && input.description !== '') {
    description = normalizePlainText(input.description, MAX_DESCRIPTION);
    if (description === null) {
      errors.push(
        fieldError('description', `Description must be 1-${MAX_DESCRIPTION} characters.`),
      );
    }
  }

  const status = validateStatus(input?.status, errors);
  const priority = validatePriority(input?.priority, errors);
  const due = validateDue(input?.dueAt, errors);
  const assignedToId = validateOptionalId(input?.assignedToId, 'assignedToId', errors);
  const categoryId = validateOptionalId(input?.categoryId, 'categoryId', errors);
  const recurrence = validateRecurrence(input?.recurrence, { errors });

  if (recurrence.provided && recurrence.recurrence && !due.dueAt && !due.dueDate) {
    errors.push(fieldError('dueAt', 'A recurring task needs a due date.'));
  }

  if (errors.length) {
    throwValidationError(errors);
  }

  return {
    title,
    description,
    status: status.status ?? 'TODO',
    priority: priority.priority ?? 'MEDIUM',
    dueAt: due.dueAt,
    dueDate: due.dueDate,
    assignedToId,
    categoryId,
    recurrence: recurrence.recurrence ?? null,
  };
}

export function validateUpdateTask(input) {
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
    if (input.description === null || input.description === '') {
      patch.description = null;
    } else {
      const description = normalizePlainText(input.description, MAX_DESCRIPTION);
      if (description === null) {
        errors.push(
          fieldError('description', `Description must be 1-${MAX_DESCRIPTION} characters.`),
        );
      } else {
        patch.description = description;
      }
    }
  }

  if (input?.status !== undefined) {
    provided = true;
    const status = validateStatus(input.status, errors);
    if (status.provided && status.status) {
      patch.status = status.status;
    }
  }

  if (input?.priority !== undefined) {
    provided = true;
    const priority = validatePriority(input.priority, errors);
    if (priority.provided && priority.priority) {
      patch.priority = priority.priority;
    }
  }

  if (input?.dueAt !== undefined) {
    provided = true;
    const due = validateDue(input.dueAt, errors);
    if (errors.length === 0) {
      patch.dueAt = due.dueAt;
      patch.dueDate = due.dueDate;
    }
  }

  if (input?.assignedToId !== undefined) {
    provided = true;
    patch.assignedToId = validateOptionalId(input.assignedToId, 'assignedToId', errors);
  }

  if (input?.categoryId !== undefined) {
    provided = true;
    patch.categoryId = validateOptionalId(input.categoryId, 'categoryId', errors);
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

export function validateListTaskQuery(input) {
  const errors = [];
  const query = {};

  const view = input?.view ?? 'all';
  if (!TASK_VIEWS.includes(view)) {
    errors.push(fieldError('view', 'Choose a task view from the list.'));
  } else {
    query.view = view;
  }

  if (input?.status !== undefined && input.status !== null && input.status !== '') {
    if (!TASK_STATUSES.includes(input.status)) {
      errors.push(fieldError('status', 'Choose a status from the list.'));
    } else {
      query.status = input.status;
    }
  }

  if (input?.priority !== undefined && input.priority !== null && input.priority !== '') {
    if (!TASK_PRIORITIES.includes(input.priority)) {
      errors.push(fieldError('priority', 'Choose a priority from the list.'));
    } else {
      query.priority = input.priority;
    }
  }

  const category = input?.category;
  if (category !== undefined && category !== null && category !== '') {
    if (category === 'none') {
      query.category = 'none';
    } else if (typeof category === 'string' && ID_PATTERN.test(category)) {
      query.category = category;
    } else {
      errors.push(fieldError('category', 'Choose a category from the list.'));
    }
  }

  const assignee = input?.assignee;
  if (assignee !== undefined && assignee !== null && assignee !== '') {
    if (assignee === 'me' || assignee === 'unassigned') {
      query.assignee = assignee;
    } else if (typeof assignee === 'string' && ID_PATTERN.test(assignee)) {
      query.assignee = assignee;
    } else {
      errors.push(fieldError('assignee', 'Choose who the task is assigned to.'));
    }
  }

  const search = typeof input?.search === 'string' ? input.search.trim() : '';
  if (search.length > MAX_SEARCH) {
    errors.push(fieldError('search', `Search must be at most ${MAX_SEARCH} characters.`));
  } else if (search) {
    query.search = search;
  }

  if (input?.sort !== undefined && input.sort !== null && input.sort !== '') {
    if (!TASK_SORTS.includes(input.sort)) {
      errors.push(fieldError('sort', 'Choose a sort order from the list.'));
    } else {
      query.sort = input.sort;
    }
  }

  if (input?.dir !== undefined && input.dir !== null && input.dir !== '') {
    if (input.dir !== 'asc' && input.dir !== 'desc') {
      errors.push(fieldError('dir', 'Sort direction must be asc or desc.'));
    } else {
      query.dir = input.dir;
    }
  }

  const page = parseIntegerParam(input?.page, { min: 1, max: 10000, fallback: 1 });
  const limit = parseIntegerParam(input?.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT });
  if (page === null) {
    errors.push(fieldError('page', 'Page must be a positive number.'));
  } else {
    query.page = page;
  }
  if (limit === null) {
    errors.push(fieldError('limit', `Limit must be between 1 and ${MAX_LIMIT}.`));
  } else {
    query.limit = limit;
  }

  if (errors.length) {
    throwValidationError(errors);
  }

  return query;
}

export function validateTaskCategory(input) {
  const errors = [];
  const name = normalizeSingleLine(input?.name, 60);
  if (name === null) {
    errors.push(fieldError('name', 'Category name must be 1-60 characters.'));
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return { name, normalized: name.toLowerCase() };
}
