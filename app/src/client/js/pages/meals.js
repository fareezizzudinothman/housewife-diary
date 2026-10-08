import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { loadingState, errorState } from '../components/states.js';
import { describeError, setStatus } from '../utils/forms.js';
import { addDays, formatDate, mondayIndex, toDateString, todayString } from '../utils/dates.js';
import { listMeals } from '../api/meals.js';

/* Weekly meal planner — one compact column per day with four slots.
   Below 900px the grid becomes stacked agenda-style day cards. */

const MEAL_SLOTS = [
  { key: 'BREAKFAST', label: 'Breakfast' },
  { key: 'LUNCH', label: 'Lunch' },
  { key: 'DINNER', label: 'Dinner' },
  { key: 'SNACK', label: 'Snack' },
];

const state = { weekStart: null, byDate: new Map() };

const plannerEl = document.querySelector('[data-planner]');
const weekLabelEl = document.querySelector('[data-week-label]');
const statusEl = document.getElementById('meal-status');

function currentWeekStart() {
  const today = new Date();
  const start = addDays(today, -mondayIndex(today));
  return new Date(start.getFullYear(), start.getMonth(), start.getDate());
}

function weekLabel(start) {
  const end = addDays(start, 6);
  const startLabel = start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const endLabel = end.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${startLabel} – ${endLabel}`;
}

function groupEntries(entries) {
  const byDate = new Map();
  for (const entry of entries) {
    if (!byDate.has(entry.date)) {
      byDate.set(entry.date, []);
    }
    byDate.get(entry.date).push(entry);
  }
  return byDate;
}

function buildEntryLink(entry) {
  const link = document.createElement('a');
  link.className = 'planner__entry';
  link.href = `/pages/meal-form.html?id=${encodeURIComponent(entry.id)}`;
  link.textContent = entry.displayTitle;
  link.title = `${entry.mealType}: ${entry.displayTitle}`;
  return link;
}

function buildAddButton(dateString, mealType) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'planner__add';
  button.textContent = '+ Add';
  button.setAttribute('aria-label', `Add a meal on ${formatDate(dateString)}`);
  button.addEventListener('click', () => {
    window.location.assign(
      `/pages/meal-form.html?date=${dateString}&mealType=${mealType}`,
    );
  });
  return button;
}

function renderPlanner() {
  const start = state.weekStart;
  const today = todayString();
  plannerEl.replaceChildren();

  for (let offset = 0; offset < 7; offset += 1) {
    const day = addDays(start, offset);
    const dateString = toDateString(day);
    const entries = state.byDate.get(dateString) ?? [];

    const dayCard = document.createElement('div');
    dayCard.className = 'planner__day';
    if (dateString === today) {
      dayCard.classList.add('planner__day--today');
    }

    const head = document.createElement('div');
    head.className = 'planner__day-head';
    const name = document.createElement('span');
    name.className = 'planner__day-name';
    name.textContent = day.toLocaleDateString(undefined, { weekday: 'short' });
    const date = document.createElement('span');
    date.className = 'planner__day-date';
    date.textContent = day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    head.append(name, date);
    dayCard.append(head);

    for (const slot of MEAL_SLOTS) {
      const slotEl = document.createElement('div');
      slotEl.className = 'planner__slot';
      const label = document.createElement('span');
      label.className = 'planner__slot-label';
      label.textContent = slot.label;
      slotEl.append(label);

      const slotted = entries.filter((entry) => entry.mealType === slot.key);
      for (const entry of slotted) {
        slotEl.append(buildEntryLink(entry));
      }
      slotEl.append(buildAddButton(dateString, slot.key));
      dayCard.append(slotEl);
    }

    plannerEl.append(dayCard);
  }
}

async function load() {
  weekLabelEl.textContent = weekLabel(state.weekStart);
  const from = toDateString(state.weekStart);
  const to = toDateString(addDays(state.weekStart, 6));
  document.querySelector('[data-new-meal]').href = `/pages/meal-form.html?date=${from}`;
  plannerEl.innerHTML = loadingState('Loading the week…');
  setStatus(statusEl, '');

  try {
    const data = await listMeals({ from, to });
    state.byDate = groupEntries(data.items);
    renderPlanner();
    const count = data.items.length;
    setStatus(statusEl, count ? `${count} ${count === 1 ? 'meal' : 'meals'} planned` : '');
  } catch (error) {
    if (error?.status === 403) {
      plannerEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to plan meals.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    plannerEl.innerHTML = errorState(describeError(error));
  }
}

function shiftWeek(days) {
  state.weekStart = addDays(state.weekStart, days);
  load();
}

function wireEvents() {
  document.querySelector('[data-prev]').addEventListener('click', () => shiftWeek(-7));
  document.querySelector('[data-next]').addEventListener('click', () => shiftWeek(7));
  document.querySelector('[data-today]').addEventListener('click', () => {
    state.weekStart = currentWeekStart();
    load();
  });
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  state.weekStart = currentWeekStart();
  wireEvents();
  await load();
}

init().catch((error) => {
  plannerEl.innerHTML = errorState(describeError(error));
});
