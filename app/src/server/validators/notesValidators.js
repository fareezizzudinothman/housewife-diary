import { fieldError, throwValidationError, trimString } from './shared.js';
import {
  validateBoolean,
  validateBooleanQuery,
  validateOptionalLine,
  validatePageParams,
} from './kitchen.js';

export const MAX_NOTE_TITLE = 200;
export const MAX_NOTE_CONTENT = 20000;
export const MAX_NOTE_CATEGORY = 100;
export const MAX_NOTE_SEARCH = 100;
export const MAX_TAGS_PER_NOTE = 10;
export const MAX_NOTE_TAG_LENGTH = 40;

function validateId(value) {
  if (/^[a-zA-Z0-9_-]{1,64}$/.test(String(value))) {
    return String(value);
  }
  return null;
}

function hasControlChars(value) {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(value);
}

// Keeps tab/newline/carriage-return and printable text (including every
// character above U+009F); drops the remaining C0/C1 control characters.
function stripControlChars(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    const isControl =
      (code < 32 && code !== 9 && code !== 10 && code !== 13) || (code >= 127 && code < 160);
    if (!isControl) {
      out += ch;
    }
  }
  return out;
}

// Content is stored as plain text: normalize newlines, drop control
// characters (except tab/newline) and trim the edges.
function normalizeContent(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = stripControlChars(value.replace(/\r\n?/g, '\n')).trim();
  return normalized.length >= 1 && normalized.length <= MAX_NOTE_CONTENT ? normalized : null;
}

function validateTags(value, errors) {
  if (value === undefined) {
    return { tags: [], provided: false };
  }
  if (!Array.isArray(value)) {
    errors.push(fieldError('tags', 'Tags must be a list of names.'));
    return { tags: [], provided: true };
  }
  if (value.length > MAX_TAGS_PER_NOTE) {
    errors.push(fieldError('tags', `Use at most ${MAX_TAGS_PER_NOTE} tags per note.`));
    return { tags: [], provided: true };
  }
  const tags = [];
  const seen = new Set();
  for (const raw of value) {
    const name = trimString(raw);
    if (name === null || name.length < 1 || name.length > MAX_NOTE_TAG_LENGTH) {
      errors.push(fieldError('tags', `Each tag must be 1-${MAX_NOTE_TAG_LENGTH} characters.`));
      return { tags: [], provided: true };
    }
    if (hasControlChars(name)) {
      errors.push(fieldError('tags', 'Tags cannot contain control characters.'));
      return { tags: [], provided: true };
    }
    const normalized = name.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    tags.push(name);
  }
  return { tags, provided: true };
}

export function validateNoteId(value) {
  const id = validateId(value);
  if (!id) {
    throwValidationError([fieldError('id', 'Invalid note id.')]);
  }
  return id;
}

export function validateCreateNote(input) {
  const errors = [];
  const title = validateOptionalLine(input?.title, 'title', MAX_NOTE_TITLE, errors);
  if (title === null || title === undefined) {
    errors.push(fieldError('title', `Title must be 1-${MAX_NOTE_TITLE} characters.`));
  }
  const content = normalizeContent(input?.content);
  if (!content) {
    errors.push(fieldError('content', `Content must be 1-${MAX_NOTE_CONTENT} characters.`));
  }
  const category = validateOptionalLine(input?.category, 'category', MAX_NOTE_CATEGORY, errors);
  const { tags } = validateTags(input?.tags, errors);
  const pinned = validateBoolean(input?.pinned, 'pinned', errors).value ?? false;
  const archived = validateBoolean(input?.archived, 'archived', errors).value ?? false;
  if (errors.length > 0) {
    throwValidationError(errors);
  }
  return {
    title,
    content,
    category: category ?? null,
    tags,
    pinned,
    archived,
  };
}

export function validateUpdateNote(input) {
  const errors = [];
  const result = {};
  if (input?.title !== undefined) {
    const title = validateOptionalLine(input.title, 'title', MAX_NOTE_TITLE, errors);
    if (title === null || title === undefined) {
      errors.push(fieldError('title', `Title must be 1-${MAX_NOTE_TITLE} characters.`));
    } else {
      result.title = title;
    }
  }
  if (input?.content !== undefined) {
    const content = normalizeContent(input.content);
    if (!content) {
      errors.push(fieldError('content', `Content must be 1-${MAX_NOTE_CONTENT} characters.`));
    } else {
      result.content = content;
    }
  }
  if (input?.category !== undefined) {
    const category = validateOptionalLine(input.category, 'category', MAX_NOTE_CATEGORY, errors);
    if (category === undefined) {
      errors.push(fieldError('category', `Category must be 1-${MAX_NOTE_CATEGORY} characters.`));
    } else {
      result.category = category;
    }
  }
  if (input?.pinned !== undefined) {
    const parsed = validateBoolean(input.pinned, 'pinned', errors);
    if (parsed.value !== undefined) {
      result.pinned = parsed.value;
    }
  }
  if (input?.archived !== undefined) {
    const parsed = validateBoolean(input.archived, 'archived', errors);
    if (parsed.value !== undefined) {
      result.archived = parsed.value;
    }
  }
  if (input?.tags !== undefined) {
    const { tags, provided } = validateTags(input.tags, errors);
    if (provided) {
      result.tags = tags;
    }
  }
  if (Object.keys(result).length === 0 && errors.length === 0) {
    errors.push(fieldError('_', 'Provide at least one field to update.'));
  }
  if (errors.length > 0) {
    throwValidationError(errors);
  }
  return result;
}

export function validateNoteQuery(input) {
  const errors = [];
  const { page, limit } = validatePageParams(input, errors, { defaultLimit: 20 });
  const search = validateOptionalLine(input?.search, 'search', MAX_NOTE_SEARCH, errors);
  const category = validateOptionalLine(input?.category, 'category', MAX_NOTE_CATEGORY, errors);
  const tag = validateOptionalLine(input?.tag, 'tag', MAX_NOTE_TAG_LENGTH, errors);
  const pinned = validateBooleanQuery(input?.pinned, 'pinned', errors).value;
  const archived = validateBooleanQuery(input?.archived, 'archived', errors).value;
  if (errors.length > 0) {
    throwValidationError(errors);
  }
  return { page, limit, search, category, tag, pinned, archived };
}