// Timezone helpers. Everything persisted stays UTC; day boundaries used by
// filters ("today", "overdue", "due this day") are computed in the user's
// timezone (users.timezone, default UTC). Recurrence materialization works
// on UTC calendar dates instead — see docs/tasks.md for that distinction.

const formatters = new Map();

function partsFormatter(timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function zonedParts(date, timeZone) {
  const map = {};
  for (const part of partsFormatter(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') {
      map[part.type] = Number(part.value);
    }
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour % 24,
    minute: map.minute,
    second: map.second,
  };
}

// Offset between the zone's wall clock and UTC at the given instant, in ms
// (positive east of Greenwich).
export function getTimeZoneOffsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

// First instant whose local calendar date in timeZone is (year, month, day).
// Handles DST shifts where local midnight does not exist by walking to the
// earliest instant that still falls on the requested date.
function startOfDayFromParts(year, month, day, timeZone) {
  const utcMidnight = Date.UTC(year, month - 1, day);
  let guess = utcMidnight - getTimeZoneOffsetMs(new Date(utcMidnight), timeZone);
  const check = zonedParts(new Date(guess), timeZone);
  if (check.year !== year || check.month !== month || check.day !== day) {
    guess = utcMidnight - getTimeZoneOffsetMs(new Date(guess), timeZone);
  }
  let start = guess;
  for (let i = 0; i < 48; i += 1) {
    const previous = start - 3_600_000;
    const p = zonedParts(new Date(previous), timeZone);
    if (p.year !== year || p.month !== month || p.day !== day) {
      break;
    }
    start = previous;
  }
  return start;
}

// Midnight (first instant) of the local day that contains `date`.
export function getZonedStartOfDay(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return startOfDayFromParts(p.year, p.month, p.day, timeZone);
}

// First instant of the local day AFTER the one containing `date`.
export function getZonedNextStartOfDay(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return startOfDayFromParts(p.year, p.month, p.day + 1, timeZone);
}

// 'YYYY-MM-DD' string -> first instant of that local day in the zone.
export function startOfDayFromString(dateString, timeZone) {
  const [year, month, day] = dateString.split('-').map(Number);
  return startOfDayFromParts(year, month, day, timeZone);
}

// Last instant (inclusive, ms precision) of the local day given by a
// 'YYYY-MM-DD' string — the natural due time for date-only tasks.
export function endOfDayFromString(dateString, timeZone) {
  const [year, month, day] = dateString.split('-').map(Number);
  return startOfDayFromParts(year, month, day + 1, timeZone) - 1;
}

// 'YYYY-MM-DD' for the local day containing `date`.
export function toDateString(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
