import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState } from '../components/states.js';
import { describeError } from '../utils/forms.js';
import {
  stats,
  chart,
  chartCaption,
  tasks,
  diary,
  shopping,
  suggestions,
} from '../mock/dashboardData.js';

/* Dashboard preview — renders the visual dashboard components from
   sample data (Phase 3 mock; real modules come later). */

function renderStats() {
  const container = document.querySelector('[data-stats]');
  container.innerHTML = stats
    .map(
      (stat) => `
      <div class="stat-tile">
        <span class="stat-tile__icon">${icon(stat.icon, { size: 'sm' })}</span>
        <span class="stat-tile__label"></span>
        <span class="stat-tile__value"></span>
        <span class="stat-tile__meta"></span>
      </div>`,
    )
    .join('');
  const tiles = container.querySelectorAll('.stat-tile');
  stats.forEach((stat, index) => {
    const tile = tiles[index];
    tile.querySelector('.stat-tile__label').textContent = stat.label;
    tile.querySelector('.stat-tile__value').textContent = stat.value;
    tile.querySelector('.stat-tile__meta').textContent = stat.meta;
  });
}

function renderChart() {
  const container = document.querySelector('[data-chart]');
  const max = Math.max(...chart.map((entry) => entry.value), 1);
  container.innerHTML = chart
    .map(
      (entry) => `
      <div class="chart__col">
        <div class="chart__bar" style="height: ${Math.max(6, Math.round((entry.value / max) * 100))}%" title="${entry.value}"></div>
        <span class="chart__label"></span>
      </div>`,
    )
    .join('');
  const labels = container.querySelectorAll('.chart__label');
  chart.forEach((entry, index) => {
    labels[index].textContent = entry.label;
  });
  container.setAttribute(
    'aria-label',
    `${chartCaption}: ${chart.map((entry) => `${entry.label} ${entry.value}`).join(', ')}`,
  );
  document.querySelector('[data-chart-title]').textContent = chartCaption;

  document.querySelector('[data-chart-legend]').innerHTML = `
    <span class="legend__item"><span class="legend__dot" style="background: var(--color-primary)"></span>${chartCaption}</span>`;
}

function renderTasks() {
  const container = document.querySelector('[data-tasks]');
  container.innerHTML = '';
  for (const task of tasks) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const info = document.createElement('div');
    info.className = 'item-info';
    info.innerHTML = '<strong></strong><br><small></small>';
    info.querySelector('strong').textContent = task.title;
    info.querySelector('small').textContent = task.meta;
    const status = document.createElement('span');
    const done = task.status === 'ok';
    status.className = `status status--${done ? 'ok' : 'pending'}`;
    status.textContent = done ? 'done' : 'to do';
    row.append(info, status);
    container.append(row);
  }
}

function renderShopping() {
  const { picked, total, label } = shopping;
  const percent = Math.round((picked / total) * 100);
  document.querySelector('[data-shopping-label]').textContent = label;
  const fill = document.querySelector('[data-shopping-fill]');
  fill.style.width = `${percent}%`;
  const progress = document.querySelector('[data-shopping-progress]');
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', String(total));
  progress.setAttribute('aria-valuenow', String(picked));
  document.querySelector('[data-shopping-status]').textContent =
    `${picked} of ${total} picked up`;
}

function renderDiary() {
  const container = document.querySelector('[data-diary]');
  container.innerHTML = diary
    .map(
      (entry) => `
      <div class="timeline__item">
        <span class="timeline__dot" aria-hidden="true"></span>
        <div class="timeline__body"><strong></strong><small></small></div>
      </div>`,
    )
    .join('');
  const bodies = container.querySelectorAll('.timeline__body');
  diary.forEach((entry, index) => {
    bodies[index].querySelector('strong').textContent = entry.title;
    bodies[index].querySelector('small').textContent = entry.meta;
  });
}

function renderFacts() {
  const facts = [
    ['Active household', 'Our home'],
    ['Members', '4'],
    ['Week starts', 'Monday'],
  ];
  const container = document.querySelector('[data-facts]');
  container.innerHTML = facts
    .map(
      ([term, value]) => `
      <div class="kv-row"><dt></dt><dd></dd></div>`,
    )
    .join('');
  const rows = container.querySelectorAll('.kv-row');
  facts.forEach(([term, value], index) => {
    rows[index].querySelector('dt').textContent = term;
    rows[index].querySelector('dd').textContent = value;
  });
}

function renderSuggestions() {
  const container = document.querySelector('[data-suggestions]');
  container.innerHTML = loadingState('Thinking about your pantry…');
  window.setTimeout(() => {
    container.innerHTML = emptyState({
      iconName: 'sparkles',
      title: suggestions.title,
      text: suggestions.text,
    });
  }, 650);
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  renderStats();
  renderChart();
  renderTasks();
  renderShopping();
  renderDiary();
  renderFacts();
  renderSuggestions();
}

init().catch((error) => {
  const main = document.querySelector('.main-inner');
  if (main) {
    main.insertAdjacentHTML(
      'afterbegin',
      `<div class="alert alert--danger" role="alert">${describeError(error)}</div>`,
    );
  }
});
