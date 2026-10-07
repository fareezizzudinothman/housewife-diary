// Bounded recurrence expansion shared by tasks (materialized rows) and
// calendar events (in-memory expansion per range).
//
// Occurrences are generated on UTC calendar dates, anchored at the series
// start's stored date, keeping the start's time-of-day. This keeps the
// pattern stable and DST-free inside the database; a rendered local time can
// shift by an hour across DST changes (documented in docs/tasks.md).

export const RECURRENCE_FREQUENCIES = Object.freeze(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

export const DAY_MS = 86_400_000;

// Hard bound on rows a single series may ever hold (head excluded). The
// rolling window below keeps typical series well under this.
export const MAX_SERIES_OCCURRENCES = 365;
// How far ahead each materialization pass writes.
export const MATERIALIZE_WINDOW_DAYS = 90;
// Lazy extension keeps at least this far ahead of "now".
export const EXTEND_AHEAD_DAYS = 21;
// Safety valve: at most this many extension passes per series per call.
export const MAX_EXTENSION_STEPS = 24;

const MAX_ITERATIONS = 50_000;

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function dateOnlyMs(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

// Exclusive upper bound: every instant whose UTC date is <= endDate.
export function ruleEndDateLimit(rule) {
  if (!rule?.endDate) {
    return Infinity;
  }
  return dateOnlyMs(rule.endDate) + DAY_MS;
}

// Occurrence instants for `rule` within [from, to] (both inclusive), never
// earlier than `start` (the series anchor), never past rule.endDate, and
// capped at `limit`. Returns ascending Dates.
export function occurrenceDates(rule, { start, from, to, limit = MAX_SERIES_OCCURRENCES }) {
  const interval = rule.interval ?? 1;
  const daysOfWeek = Array.isArray(rule.daysOfWeek)
    ? [...rule.daysOfWeek].sort((a, b) => a - b)
    : null;

  const startMs = start.getTime();
  const startDayMs = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const timeMs = startMs - startDayMs;
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const endLimit = ruleEndDateLimit(rule);

  const accepted = [];
  const within = (candidate) =>
    candidate >= fromMs && candidate >= startMs && candidate <= toMs && candidate < endLimit;
  const add = (candidate) => {
    if (within(candidate)) {
      accepted.push(new Date(candidate));
    }
    return accepted.length < limit;
  };

  let iterations = 0;

  if (rule.frequency === 'DAILY') {
    const stepMs = interval * DAY_MS;
    for (let k = 0; k * stepMs <= toMs - startMs + stepMs; k += 1) {
      if (++iterations > MAX_ITERATIONS || accepted.length >= limit) {
        break;
      }
      const candidate = startMs + k * stepMs;
      if (candidate > toMs || candidate >= endLimit) {
        break;
      }
      add(candidate);
    }
  } else if (rule.frequency === 'WEEKLY') {
    const startWeekday = new Date(startDayMs).getUTCDay();
    const days = daysOfWeek ?? [startWeekday];
    const week0 = startDayMs - startWeekday * DAY_MS;
    const stepMs = interval * 7 * DAY_MS;
    for (let k = 0; k < 100_000; k += 1) {
      if (++iterations > MAX_ITERATIONS || accepted.length >= limit) {
        break;
      }
      const weekMs = week0 + k * stepMs;
      if (weekMs > toMs || weekMs >= endLimit) {
        break;
      }
      if (weekMs + 6 * DAY_MS + timeMs < fromMs) {
        continue;
      }
      for (const day of days) {
        const candidate = weekMs + day * DAY_MS + timeMs;
        if (candidate > toMs) {
          break;
        }
        add(candidate);
        if (accepted.length >= limit) {
          break;
        }
      }
    }
  } else if (rule.frequency === 'MONTHLY') {
    const baseMonth = start.getUTCFullYear() * 12 + start.getUTCMonth();
    const startDay = start.getUTCDate();
    for (let k = 0; k < 10_000; k += 1) {
      if (++iterations > MAX_ITERATIONS || accepted.length >= limit) {
        break;
      }
      const months = baseMonth + k * interval;
      const year = Math.floor(months / 12);
      const month = months % 12;
      if (startDay > daysInMonth(year, month)) {
        continue;
      }
      const candidate = Date.UTC(year, month, startDay) + timeMs;
      if (candidate > toMs || candidate >= endLimit) {
        break;
      }
      add(candidate);
    }
  } else if (rule.frequency === 'YEARLY') {
    const startY = start.getUTCFullYear();
    const startM = start.getUTCMonth();
    const startD = start.getUTCDate();
    for (let k = 0; k < 5_000; k += 1) {
      if (++iterations > MAX_ITERATIONS || accepted.length >= limit) {
        break;
      }
      const year = startY + k * interval;
      if (startM === 1 && startD === 29 && !isLeapYear(year)) {
        continue;
      }
      const candidate = Date.UTC(year, startM, startD) + timeMs;
      if (candidate > toMs || candidate >= endLimit) {
        break;
      }
      add(candidate);
    }
  }

  return accepted;
}
