// Shared parsing/formatting helpers for the task and calendar validators.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Date-time must carry an explicit offset (the client always sends UTC Z).
const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

// Keeps tab/newline/carriage-return and printable text (including every
// character above U+009F); drops the remaining C0/C1 control characters.
export function stripControlChars(text) {
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

// Calendar date (YYYY-MM-DD within a sane range); null when invalid.
export function parseDateString(value) {
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

// ISO 8601 date-time with explicit offset (Z or ±hh:mm); null when invalid.
export function parseIsoDateTime(value) {
  if (typeof value !== 'string' || !ISO_DATETIME_PATTERN.test(value)) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  // Reject impossible calendar dates (2026-02-30) that Date would roll over.
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const dateOnly = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    year > 2100 ||
    dateOnly.getUTCFullYear() !== year ||
    dateOnly.getUTCMonth() !== month - 1 ||
    dateOnly.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

// Multi-line plain text: normalize newlines, drop control characters
// (except tab/newline) and trim the edges. Empty -> null.
export function normalizePlainText(value, maxLength) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = stripControlChars(value.replace(/\r\n?/g, '\n')).trim();
  return normalized.length >= 1 && normalized.length <= maxLength ? normalized : null;
}

// Single-line text (titles, locations): no control characters at all,
// trimmed. Empty -> null.
export function normalizeSingleLine(value, maxLength) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = stripControlChars(value).replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized.length >= 1 && normalized.length <= maxLength ? normalized : null;
}

// Display name + matching key for kitchen items (ingredients, shopping and
// inventory rows). The normalized form is lowercased and whitespace-collapsed
// so "Chicken  Breast" and "chicken breast" merge consistently.
export function normalizeLookupName(value, maxLength) {
  const name = normalizeSingleLine(value, maxLength);
  return name === null ? null : { name, normalized: name.toLowerCase() };
}

// Normalized comparison key for units ('' when absent) so matching never
// depends on letter case or stray whitespace.
export function normalizeUnit(value, maxLength = 30) {
  if (value === undefined || value === null || value === '') {
    return { unit: null, unitKey: '' };
  }
  const unit = normalizeSingleLine(value, maxLength);
  return unit === null ? null : { unit, unitKey: unit.toLowerCase() };
}

// Finite decimal (quantity) rounded to three decimal places; null when the
// value is absent, non-numeric or out of range.
export function parseDecimalQuantity(value, { min = 0, max = 1_000_000 } = {}) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const rounded = Math.round(parsed * 1000) / 1000;
  return rounded >= min && rounded <= max ? rounded : null;
}
