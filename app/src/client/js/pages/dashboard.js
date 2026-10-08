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

function inventoryAlertCount(module) {
  return (
    (module.lowStockCount ?? 0) +
    (module.outOfStockCount ?? 0) +
    (module.expiringSoonCount ?? 0) +
    (module.expiredCount ?? 0)
  );
}

const MODULES = [
  {
    key: 'meals',
    label: 'Meals',
    iconName: 'utensils',
    href: '/pages/meals.html',
    meta: (module) =>
      module.today.length
        ? `${module.today.length} today`
        : module.next
          ? 'Planned'
          : 'Plan the week',
  },
  {
    key: 'shopping',
    label: 'Shopping',
    iconName: 'cart',
    href: '/pages/shopping.html',
    meta: (module) =>
      module.activeList
        ? `${module.activeList.remaining} left`
        : 'No lists',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    iconName: 'package',
    href: '/pages/inventory.html',
    meta: (module) => {
      const count = inventoryAlertCount(module);
      return count ? `${count} ${count === 1 ? 'alert' : 'alerts'}` : 'All good';
    },
  },
  {
    key: 'recipes',
    label: 'Recipes',
    iconName: 'book',
    href: '/pages/recipes.html',
    meta: (module) => `${module.count ?? 0} saved`,
  },
  {
    key: 'tasks',
    label: 'Tasks',
    iconName: 'list-checks',
    href: '/pages/tasks.html',
    meta: (module) => `${module.openCount ?? 0} open`,
  },
  {
    key: 'calendar',
    label: 'Calendar',
    iconName: 'calendar',
    href: '/pages/calendar.html',
    meta: (module) => `${module.upcomingCount ?? 0} this week`,
  },
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
  const dueToday = dashboard.tasks?.dueTodayCount ?? 0;
  const alerts = inventoryAlertCount(dashboard.inventory ?? {});
  const shopping = dashboard.shopping ?? {};
  const stats = [
    { label: 'Open tasks', value: String(dashboard.tasks?.openCount ?? 0), meta: dueToday > 0 ? `${dueToday} due today` : 'Nothing due today' },
    { label: 'Shopping left', value: String(shopping.activeList?.remaining ?? 0), meta: shopping.activeList?.name ?? 'No active list' },
    { label: 'Stock alerts', value: String(alerts), meta: alerts > 0 ? 'Needs attention' : 'All good' },
    { label: 'Diary entries', value: String(dashboard.diary.count), meta: dashboard.diary.status === 'empty' ? 'Start writing' : 'Written so far' },
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
  const icons = ['list-checks', 'cart', 'package', 'book'];
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

const MEAL_LABELS = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACK: 'Snack',
};

const ALERT_LABELS = {
  EXPIRED: 'Expired',
  OUT_OF_STOCK: 'Out of stock',
  EXPIRING_SOON: 'Expiring soon',
  LOW_STOCK: 'Low stock',
};

function sectionDivider() {
  const divider = document.createElement('div');
  divider.className = 'divider';
  return divider;
}

function sectionHeading(text) {
  const heading = document.createElement('p');
  heading.className = 'timeline__slot';
  heading.textContent = text;
  return heading;
}

function mutedLine(text) {
  const line = document.createElement('p');
  line.className = 'muted';
  line.textContent = text;
  return line;
}

// The "Today" card keeps meals, shopping and stock alerts together so the
// dashboard stays four calm cards instead of a wall of panels.
function renderToday(dashboard) {
  const panel = document.querySelector('[data-today-panel]');
  panel.replaceChildren();

  panel.append(sectionHeading('Meals today'));
  if (dashboard.meals.today.length) {
    for (const meal of dashboard.meals.today) {
      const row = document.createElement('div');
      row.className = 'kv-row';
      const term = document.createElement('dt');
      term.textContent = MEAL_LABELS[meal.mealType] ?? meal.mealType;
      const value = document.createElement('dd');
      value.textContent = meal.displayTitle;
      row.append(term, value);
      panel.append(row);
    }
  } else if (dashboard.meals.next) {
    panel.append(
      mutedLine(
        `Next: ${MEAL_LABELS[dashboard.meals.next.mealType] ?? ''} ${formatDate(dashboard.meals.next.date)} — ${dashboard.meals.next.displayTitle}`.trim(),
      ),
    );
  } else {
    panel.append(mutedLine('Nothing planned yet.'));
  }

  panel.append(sectionDivider());
  panel.append(sectionHeading('Shopping'));
  if (dashboard.shopping.activeList) {
    const list = dashboard.shopping.activeList;
    panel.append(
      mutedLine(
        list.remaining === 0
          ? `“${list.name}” — all ${list.itemCount} items bought`
          : `“${list.name}” — ${list.remaining} of ${list.itemCount} left`,
      ),
    );
    const link = document.createElement('a');
    link.className = 'btn btn--ghost btn--small';
    link.href = `/pages/shopping-list.html?id=${encodeURIComponent(list.id)}`;
    link.textContent = 'Open list';
    panel.append(link);
  } else {
    panel.append(mutedLine('No active list.'));
  }

  panel.append(sectionDivider());
  panel.append(sectionHeading('Inventory'));
  const alerts = dashboard.inventory.alerts ?? [];
  if (alerts.length) {
    for (const alert of alerts) {
      const line = document.createElement('p');
      line.className = 'meta-text';
      const label = ALERT_LABELS[alert.expiryStatus] ?? ALERT_LABELS[alert.status] ?? '';
      const expiry = alert.expiresAt ? ` · expires ${formatDate(alert.expiresAt)}` : '';
      line.textContent = `${alert.name} — ${label}${expiry}`;
      panel.append(line);
    }
  } else {
    panel.append(mutedLine('Stock looks good.'));
  }
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
  container.replaceChildren();
  for (const module of MODULES) {
    const data = dashboard[module.key] ?? {};
    const tag = module.href ? document.createElement('a') : document.createElement('div');
    tag.className = 'module-tile';
    if (module.href) {
      tag.classList.add('module-tile--link');
      tag.href = module.href;
    }

    const iconHost = document.createElement('span');
    iconHost.className = 'module-tile__icon';
    iconHost.innerHTML = icon(module.iconName, { size: 'sm' });

    const label = document.createElement('span');
    label.className = 'module-tile__label';
    label.textContent = module.label;

    tag.append(iconHost, label);
    if (module.meta) {
      const meta = document.createElement('span');
      meta.className = 'module-tile__meta';
      meta.textContent = module.meta(data);
      tag.append(meta);
    } else {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Soon';
      tag.append(badge);
      tag.title = `${module.label} is not available yet`;
    }
    container.append(tag);
  }
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
  document.querySelector('[data-today-panel]').innerHTML = '';
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);

  const panel = document.querySelector('[data-diary-panel]');
  panel.innerHTML = loadingState('Loading your dashboard…');
  const todayPanel = document.querySelector('[data-today-panel]');
  todayPanel.innerHTML = loadingState('Loading today…');

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
  renderToday(dashboard);
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
