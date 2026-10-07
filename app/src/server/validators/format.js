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
