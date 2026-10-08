// Shared date helpers for tasks and calendar. All values crossing the API
// are ISO instants in UTC; the browser renders them in the local timezone.

export function toDateString(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayString() {
  return toDateString(new Date());
}

// 'YYYY-MM-DD' parsed as a local date so it never shifts a day.
export function fromDateString(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDate(dateString, options = {}) {
  return fromDateString(dateString).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  });
}

export function formatLongDate(dateString) {
  return formatDate(dateString, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatMonthYear(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

// True when the instant is the last millisecond of its local day — the
// convention for date-only tasks stored server-side.
export function isEndOfLocalDay(isoInstant) {
  const date = new Date(isoInstant);
  return (
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
      999,
    ).getTime() === date.getTime()
  );
}

export function formatTime(isoInstant) {
  return new Date(isoInstant).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Monday-first weekday index (0 = Monday … 6 = Sunday).
export function mondayIndex(date) {
  return (date.getDay() + 6) % 7;
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
