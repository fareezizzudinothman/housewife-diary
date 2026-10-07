import { fieldError, throwValidationError, trimString } from './shared.js';

const TIME_OF_DAY = ['MORNING', 'AFTERNOON', 'EVENING'];

const MAX_TITLE = 200;
const MAX_CONTENT = 20000;
const MAX_TAGS_PER_ENTRY = 10;
const MAX_TAG_LENGTH = 40;
const MAX_SEARCH = 100;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MOOD_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/;

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

function hasControlChars(text) {
  return stripControlChars(text).length !== text.length;
}

// Parses a calendar date (YYYY-MM-DD within a sane range); null when invalid.
function parseDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    year > 2100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseInteger(value, { min, max, fallback }) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const text = String(value);
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const parsed = Number(text);
  return parsed >= min && parsed <= max ? parsed : null;
}

// Content is stored as plain text: normalize newlines, drop control
// characters (except tab/newline) and trim the edges.
function normalizeContent(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = stripControlChars(value.replace(/\r\n?/g, '\n')).trim();
  return normalized.length >= 1 && normalized.length <= MAX_CONTENT ? normalized : null;
}

function validateTags(value) {
  if (value === undefined || value === null) {
    return { tags: [], provided: false };
  }
  if (!Array.isArray(value)) {
    return { error: fieldError('tags', 'Tags must be a list of names.') };
  }
  if (value.length > MAX_TAGS_PER_ENTRY) {
    return {
      error: fieldError('tags', `Use at most ${MAX_TAGS_PER_ENTRY} tags per entry.`),
    };
  }
  const tags = [];
  const seen = new Set();
  for (const raw of value) {
    const name = trimString(raw);
    if (name === null || name.length < 1 || name.length > MAX_TAG_LENGTH) {
      return {
        error: fieldError('tags', `Each tag must be 1-${MAX_TAG_LENGTH} characters.`),
      };
    }
    if (hasControlChars(name)) {
      return { error: fieldError('tags', 'Tags cannot contain control characters.') };
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

function validateMood(value, errors) {
  if (value === undefined) {
    return { mood: undefined, provided: false };
  }
  if (value === null || value === '') {
    return { mood: null, provided: true };
  }
  if (typeof value !== 'string' || !MOOD_PATTERN.test(value)) {
    errors.push(fieldError('mood', 'Choose a mood from the list.'));
    return { mood: null, provided: true };
  }
  return { mood: value, provided: true };
}

function validateTimeOfDay(value, errors) {
  if (value === undefined || value === null || value === '') {
    return { timeOfDay: undefined, provided: false };
  }
  if (!TIME_OF_DAY.includes(value)) {
    errors.push(fieldError('timeOfDay', 'Time of day must be morning, afternoon or evening.'));
    return { timeOfDay: undefined, provided: true };
  }
  return { timeOfDay: value, provided: true };
}

export function validateCreateDiaryEntry(input) {
  const errors = [];

  const title = trimString(input?.title);
  if (title === null || title.length < 1 || title.length > MAX_TITLE) {
    errors.push(fieldError('title', `Title must be 1-${MAX_TITLE} characters.`));
  }

  const content = normalizeContent(input?.content);
  if (content === null) {
    errors.push(fieldError('content', `Content must be 1-${MAX_CONTENT} characters.`));
  }

  const entryDate = parseDate(input?.entryDate);
  if (entryDate === null) {
    errors.push(fieldError('entryDate', 'Entry date must be a valid YYYY-MM-DD date.'));
  }

  const mood = validateMood(input?.mood, errors);
  const timeOfDay = validateTimeOfDay(input?.timeOfDay, errors);
  const tagResult = validateTags(input?.tags);
  if (tagResult.error) {
    errors.push(tagResult.error);
  }

  if (errors.length) {
    throwValidationError(errors);
  }

  return {
    title,
    content,
    entryDate,
    mood: mood.mood,
    timeOfDay: timeOfDay.timeOfDay,
    tags: tagResult.tags,
  };
}

export function validateUpdateDiaryEntry(input) {
  const errors = [];
  const patch = {};
  let provided = false;

  if (input?.title !== undefined) {
    provided = true;
    const title = trimString(input.title);
    if (title === null || title.length < 1 || title.length > MAX_TITLE) {
      errors.push(fieldError('title', `Title must be 1-${MAX_TITLE} characters.`));
    } else {
      patch.title = title;
    }
  }

  if (input?.content !== undefined) {
    provided = true;
    const content = normalizeContent(input.content);
    if (content === null) {
      errors.push(fieldError('content', `Content must be 1-${MAX_CONTENT} characters.`));
    } else {
      patch.content = content;
    }
  }

  if (input?.entryDate !== undefined) {
    provided = true;
    const entryDate = parseDate(input.entryDate);
    if (entryDate === null) {
      errors.push(fieldError('entryDate', 'Entry date must be a valid YYYY-MM-DD date.'));
    } else {
      patch.entryDate = entryDate;
    }
  }

  const mood = validateMood(input?.mood, errors);
  if (mood.provided) {
    provided = true;
    patch.mood = mood.mood;
  }

  const timeOfDay = validateTimeOfDay(input?.timeOfDay, errors);
  if (timeOfDay.provided) {
    provided = true;
    patch.timeOfDay = timeOfDay.timeOfDay;
  }

  const tagResult = validateTags(input?.tags);
  if (tagResult.error) {
    errors.push(tagResult.error);
    provided = true;
  } else if (tagResult.provided) {
    provided = true;
    patch.tags = tagResult.tags;
  }

  if (!provided) {
    errors.push(fieldError('body', 'Provide at least one field to update.'));
  }

  if (errors.length) {
    throwValidationError(errors);
  }

  return patch;
}

export function validateListDiaryQuery(input) {
  const errors = [];
  const query = {};

  const search = trimString(input?.search);
  if (search !== null) {
    if (search.length > MAX_SEARCH) {
      errors.push(fieldError('search', `Search must be at most ${MAX_SEARCH} characters.`));
    } else if (search) {
      query.search = search;
    }
  }

  if (input?.from !== undefined && input.from !== null && input.from !== '') {
    const from = parseDate(input.from);
    if (from === null) {
      errors.push(fieldError('from', 'From must be a valid YYYY-MM-DD date.'));
    } else {
      query.from = from;
    }
  }

  if (input?.to !== undefined && input.to !== null && input.to !== '') {
    const to = parseDate(input.to);
    if (to === null) {
      errors.push(fieldError('to', 'To must be a valid YYYY-MM-DD date.'));
    } else {
      query.to = to;
    }
  }

  if (query.from && query.to && query.from > query.to) {
    errors.push(fieldError('from', 'From date must not be after the to date.'));
  }

  const mood = trimString(input?.mood);
  if (mood) {
    if (!MOOD_PATTERN.test(mood)) {
      errors.push(fieldError('mood', 'Choose a mood from the list.'));
    } else {
      query.mood = mood;
    }
  }

  const tag = trimString(input?.tag);
  if (tag) {
    if (tag.length > MAX_TAG_LENGTH) {
      errors.push(fieldError('tag', `Tag must be at most ${MAX_TAG_LENGTH} characters.`));
    } else {
      query.tag = tag;
    }
  }

  const page = parseInteger(input?.page, { min: 1, max: 10000, fallback: 1 });
  const limit = parseInteger(input?.limit, { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT });
  if (page === null) {
    errors.push(fieldError('page', 'Page must be a positive whole number.'));
  }
  if (limit === null) {
    errors.push(fieldError('limit', `Limit must be between 1 and ${MAX_LIMIT}.`));
  }

  if (errors.length) {
    throwValidationError(errors);
  }

  return { ...query, page, limit };
}
