import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { loadingState, errorState } from '../components/states.js';
import { describeError, setStatus } from '../utils/forms.js';
import {
  addDays,
  formatLongDate,
  formatMonthYear,
  formatDate,
  formatTime,
  fromDateString,
  mondayIndex,
  todayString,
  toDateString,
} from '../utils/dates.js';
import { listCalendarEvents } from '../api/calendar.js';

/* Month calendar — native events plus read-only task-derived items
   (sourceType TASK). Clicking a day filters the panel below the grid. */

const WEEKDAYS = 7;
const GRID_DAYS = 42;
const MAX_CHIPS = 2;

const state = {
  cursor: new Date(),
  selected: todayString(),
  byDate: new Map(),
};

const titleEl = document.querySelector('[data-calendar-title]');
const gridEl = document.querySelector('[data-grid]');
const dayTitleEl = document.querySelector('[data-day-title]');
const daySubtitleEl = document.querySelector('[data-day-subtitle]');
const dayListEl = document.querySelector('[data-day-list]');
const dayAddEl = document.querySelector('[data-day-add]');
const statusEl = document.getElementById('calendar-status');

function gridStart() {
  const first = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
  return addDays(first, -mondayIndex(first));
}

function groupByDate(events) {
  const byDate = new Map();
  for (const event of events) {
    const date = new Date(event.startAt);
    const key = toDateString(date);
    if (!byDate.has(key)) {
      byDate.set(key, []);
    }
    byDate.get(key).push(event);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.title.localeCompare(b.title));
  }
  return byDate;
}

function renderTitle() {
  titleEl.textContent = formatMonthYear(state.cursor.getFullYear(), state.cursor.getMonth());
}

function eventChip(event) {
  const chip = document.createElement('span');
  chip.className = 'cal-event';
  if (event.sourceType === 'TASK') {
    chip.classList.add('cal-event--task');
  }
  const prefix = event.allDay ? '' : `${formatTime(event.startAt)} `;
  chip.textContent = `${prefix}${event.title}`;
  chip.title = `${event.allDay ? 'All day' : formatTime(event.startAt)} · ${event.title}`;
  return chip;
}

function renderGrid() {
  const start = gridStart();
  const today = todayString();
  gridEl.replaceChildren();

  for (let index = 0; index < GRID_DAYS; index += 1) {
    const day = addDays(start, index);
    const dateString = toDateString(day);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-cell';
    cell.dataset.date = dateString;
    if (day.getMonth() !== state.cursor.getMonth()) {
      cell.classList.add('cal-cell--muted');
    }
    if (dateString === today) {
      cell.classList.add('cal-cell--today');
    }
    if (dateString === state.selected) {
      cell.classList.add('cal-cell--selected');
    }

    const num = document.createElement('span');
    num.className = 'cal-cell__num';
    num.textContent = String(day.getDate());
    cell.append(num);

    const events = state.byDate.get(dateString) ?? [];
    if (events.length) {
      const holder = document.createElement('span');
      holder.className = 'cal-cell__events';
      for (const event of events.slice(0, MAX_CHIPS)) {
        holder.append(eventChip(event));
      }
      if (events.length > MAX_CHIPS) {
        const more = document.createElement('span');
        more.className = 'cal-cell__more';
        more.textContent = `+${events.length - MAX_CHIPS} more`;
        holder.append(more);
      }
      cell.append(holder);
      cell.setAttribute('aria-label', `${formatDate(dateString)} — ${events.length} items`);
    }
    gridEl.append(cell);
  }
}

function buildDayRow(event) {
  const row = document.createElement('div');
  row.className = 'item-row';
  if (event.sourceType === 'TASK') {
    row.classList.add('item-row--task');
  }

  const info = document.createElement('div');
  info.className = 'item-info';

  const title = document.createElement('a');
  title.className = 'calendar-row__title';
  title.textContent = event.title;
  if (event.sourceType === 'TASK') {
    title.href = `/pages/task-form.html?id=${encodeURIComponent(event.sourceId)}`;
  } else if (event.sourceType === 'MEAL') {
    title.href = `/pages/meal-form.html?id=${encodeURIComponent(event.sourceId)}`;
  } else if (event.sourceType === 'BILL') {
    title.href = '/pages/bills.html';
  } else {
    title.href = `/pages/event-form.html?id=${encodeURIComponent(event.id)}`;
  }

  const meta = document.createElement('small');
  const parts = [event.allDay ? 'All day' : `${formatTime(event.startAt)}–${formatTime(event.endAt)}`];
  if (event.location) {
    parts.push(event.location);
  }
  if (event.sourceType === 'TASK') {
    parts.push('Task');
  }
  if (event.sourceType === 'MEAL') {
    parts.push('Meal');
  }
  if (event.sourceType === 'BILL') {
    parts.push('Bill');
  }
  if (event.recurring) {
    parts.push('Repeats');
  }
  meta.textContent = parts.join(' · ');

  info.append(title, meta);
  row.append(info);
  return row;
}

function renderDayPanel() {
  const events = state.byDate.get(state.selected) ?? [];
  const isToday = state.selected === todayString();
  dayTitleEl.textContent = isToday ? `Today · ${formatDate(state.selected, { weekday: 'long' })}` : formatDate(state.selected, { weekday: 'long' });
  daySubtitleEl.textContent = events.length
    ? `${events.length} ${events.length === 1 ? 'item' : 'items'}`
    : 'Nothing planned';
  dayAddEl.href = `/pages/event-form.html?date=${state.selected}`;

  if (!events.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No events or tasks on this day.';
    dayListEl.replaceChildren(empty);
    return;
  }
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const event of events) {
    list.append(buildDayRow(event));
  }
  dayListEl.replaceChildren(list);
}

function select(dateString) {
  state.selected = dateString;
  renderGrid();
  renderDayPanel();
}

function shiftMonth(delta) {
  state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + delta, 1);
  const selected = fromDateString(state.selected);
  if (selected.getMonth() !== state.cursor.getMonth() || selected.getFullYear() !== state.cursor.getFullYear()) {
    state.selected = toDateString(state.cursor);
  }
  load();
}

function goToday() {
  state.cursor = new Date();
  state.selected = todayString();
  load();
}

async function load() {
  renderTitle();
  gridEl.innerHTML = loadingState('Loading calendar…');
  dayListEl.replaceChildren();
  setStatus(statusEl, '');
  const from = toDateString(gridStart());
  const to = toDateString(addDays(gridStart(), GRID_DAYS - 1));

  try {
    const data = await listCalendarEvents({ from, to });
    state.byDate = groupByDate(data.events);
    renderGrid();
    renderDayPanel();
    const count = data.events.length;
    setStatus(statusEl, `${count} ${count === 1 ? 'item' : 'items'} in view`);
  } catch (error) {
    gridEl.replaceChildren();
    if (error?.status === 403) {
      gridEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to use the calendar.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    gridEl.innerHTML = errorState(describeError(error));
  }
}

function wireEvents() {
  gridEl.addEventListener('click', (event) => {
    const cell = event.target.closest('.cal-cell');
    if (cell) {
      select(cell.dataset.date);
    }
  });
  document.querySelector('[data-prev]').addEventListener('click', () => shiftMonth(-1));
  document.querySelector('[data-next]').addEventListener('click', () => shiftMonth(1));
  document.querySelector('[data-today]').addEventListener('click', goToday);
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  state.cursor = fromDateString(todayString());
  state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
  state.selected = todayString();
  wireEvents();
  await load();
}

init().catch((error) => {
  gridEl.innerHTML = errorState(describeError(error));
});
