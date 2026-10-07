import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { describeError } from '../utils/forms.js';
import { getDashboard } from '../api/dashboard.js';

/* Real dashboard — aggregates auth, household and diary data from
   /api/dashboard. Future modules render as explicit "coming soon"
   placeholders; nothing here is mocked. */

const TIME_LABELS = { MORNING: 'Morning', AFTERNOON: 'Afternoon', EVENING: 'Evening' };

const UPCOMING_MODULES = [
  { key: 'tasks', label: 'Tasks', iconName: 'list-checks' },
  { key: 'calendar', label: 'Calendar', iconName: 'calendar' },
  { key: 'meals', label: 'Meals', iconName: 'utensils' },
  { key: 'shopping', label: 'Shopping', iconName: 'cart' },
  { key: 'inventory', label: 'Inventory', iconName: 'package' },
  { key: 'finance', label: 'Finance', iconName: 'wallet' },
];

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 5) {
    return 'Good night';
  }
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

// "2026-10-01" is parsed as a local date so it never shifts a day.
function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function renderStats(dashboard) {
  const container = document.querySelector('[data-stats]');
  const stats = [
    { label: 'Diary entries', value: String(dashboard.diary.count), meta: dashboard.diary.status === 'empty' ? 'Start writing' : 'Written so far' },
    { label: 'Members', value: String(dashboard.household?.memberCount ?? 0), meta: dashboard.household?.name ?? 'No household' },
    { label: 'Your role', value: dashboard.household?.role ?? '—', meta: 'In the active household' },
  ];
  container.innerHTML = stats
    .map(
      () => `
      <div class="stat-tile">
        <span class="stat-tile__icon"></span>
        <span class="stat-tile__label"></span>
        <span class="stat-tile__value"></span>
        <span class="stat-tile__meta"></span>
      </div>`,
    )
    .join('');
  const icons = ['book', 'users', 'user'];
  const tiles = container.querySelectorAll('.stat-tile');
  stats.forEach((stat, index) => {
    const tile = tiles[index];
    tile.querySelector('.stat-tile__icon').innerHTML = icon(icons[index], { size: 'sm' });
    tile.querySelector('.stat-tile__label').textContent = stat.label;
    tile.querySelector('.stat-tile__value').textContent = stat.value;
    tile.querySelector('.stat-tile__meta').textContent = stat.meta;
  });
}

function renderDiaryPanel(diary) {
  const panel = document.querySelector('[data-diary-panel]');
  const subtitle = document.querySelector('[data-diary-subtitle]');

  if (diary.status === 'empty') {
    subtitle.textContent = 'Nothing written yet';
    panel.innerHTML = emptyState({
      iconName: 'book',
      title: 'Your diary is empty',
      text: 'Capture the day in a few lines — it stays private to you.',
      action: '<a class="btn btn--primary btn--small" href="/pages/diary-form.html">Write your first entry</a>',
    });
    return;
  }

  subtitle.textContent = `${diary.count} ${diary.count === 1 ? 'entry' : 'entries'} · latest first`;
  const timeline = document.createElement('div');
  timeline.className = 'timeline';
  for (const entry of diary.recent) {
    const item = document.createElement('div');
    item.className = 'timeline__item';

    const dot = document.createElement('span');
    dot.className = 'timeline__dot';
    dot.setAttribute('aria-hidden', 'true');

    const body = document.createElement('div');
    body.className = 'timeline__body';
    const link = document.createElement('a');
    link.href = `/pages/diary-entry.html?id=${encodeURIComponent(entry.id)}`;
    link.textContent = entry.title;
    const meta = document.createElement('small');
    const parts = [formatDate(entry.entryDate), TIME_LABELS[entry.timeOfDay]];
    if (entry.mood) {
      parts.push(entry.mood.name);
    }
    meta.textContent = parts.join(' · ');

    body.append(link, meta);
    item.append(dot, body);
    timeline.append(item);
  }
  panel.replaceChildren(timeline);
}

function renderHouseholdFacts(dashboard) {
  const container = document.querySelector('[data-household-facts]');
  const facts = [
    ['Household', dashboard.household?.name ?? '—'],
    ['Your role', dashboard.household?.role ?? '—'],
    ['Members', String(dashboard.household?.memberCount ?? 0)],
    ['Email verified', dashboard.user.emailVerified ? 'Yes' : 'Not yet'],
  ];
  container.innerHTML = facts.map(() => '<div class="kv-row"><dt></dt><dd></dd></div>').join('');
  const rows = container.querySelectorAll('.kv-row');
  facts.forEach(([term, value], index) => {
    rows[index].querySelector('dt').textContent = term;
    rows[index].querySelector('dd').textContent = value;
  });
}

function renderModules(dashboard) {
  const container = document.querySelector('[data-modules]');
  container.innerHTML = UPCOMING_MODULES.map(
    () => `
    <div class="module-tile">
      <span class="module-tile__icon"></span>
      <span class="module-tile__label"></span>
      <span class="badge">Soon</span>
    </div>`,
  ).join('');
  const tiles = container.querySelectorAll('.module-tile');
  UPCOMING_MODULES.forEach((module, index) => {
    const tile = tiles[index];
    tile.querySelector('.module-tile__icon').innerHTML = icon(module.iconName, { size: 'sm' });
    tile.querySelector('.module-tile__label').textContent = module.label;
    const status = dashboard[module.key]?.status;
    tile.title = status === 'not_available' ? `${module.label} is not available yet` : module.label;
  });
}

function renderNoHouseholdNotice() {
  document.querySelector('[data-subtitle]').textContent =
    'Join or create a household to see your dashboard.';
  document.querySelector('[data-dashboard-notice]').innerHTML = `
    <div class="alert alert--warning" role="alert">
      <strong>No active household.</strong> Create or join a household first, then your home
      overview will appear here. <a href="/pages/household.html">Set up a household</a>
    </div>`;
  document.querySelector('[data-stats]').innerHTML = '';
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);

  const panel = document.querySelector('[data-diary-panel]');
  panel.innerHTML = loadingState('Loading your dashboard…');

  let dashboard;
  try {
    dashboard = await getDashboard();
  } catch (error) {
    if (error?.status === 403) {
      renderNoHouseholdNotice();
      panel.innerHTML = '';
      return;
    }
    throw error;
  }

  document.querySelector('[data-greeting]').textContent =
    `${greetingForNow()}, ${dashboard.user.name.split(' ')[0]}`;
  document.querySelector('[data-subtitle]').textContent =
    dashboard.household
      ? `${dashboard.household.name} · ${dashboard.household.role === 'OWNER' ? 'You own this household' : `You are ${dashboard.household.role.toLowerCase()}`}`
      : 'Your home at a glance.';

  renderStats(dashboard);
  renderDiaryPanel(dashboard.diary);
  renderHouseholdFacts(dashboard);
  renderModules(dashboard);
}

init().catch((error) => {
  const panel = document.querySelector('[data-diary-panel]');
  if (panel) {
    panel.innerHTML = errorState(describeError(error));
  }
});
