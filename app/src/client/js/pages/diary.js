import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { describeError, setStatus } from '../utils/forms.js';
import { listDiary, getDiaryMeta } from '../api/diary.js';

/* Diary timeline — personal entries grouped by date and time of day,
   with search/filters and pagination. All user content is rendered via
   textContent (never innerHTML). */

const TIME_SLOTS = [
  { key: 'MORNING', label: 'Morning' },
  { key: 'AFTERNOON', label: 'Afternoon' },
  { key: 'EVENING', label: 'Evening' },
];

const state = {
  search: '',
  from: '',
  to: '',
  mood: '',
  tag: '',
  page: 1,
  limit: 10,
};

const listEl = document.querySelector('[data-diary-list]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const filterStatusEl = document.getElementById('diary-filter-status');
const filtersForm = document.getElementById('diary-filters');

function formatLongDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function isFiltered() {
  return Boolean(state.search || state.from || state.to || state.mood || state.tag);
}

function chip(text, className) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function buildEntryItem(entry) {
  const item = document.createElement('div');
  item.className = 'timeline__item';

  const dot = document.createElement('span');
  dot.className = 'timeline__dot';
  dot.setAttribute('aria-hidden', 'true');

  const body = document.createElement('div');
  body.className = 'timeline__body diary-entry-row';

  const link = document.createElement('a');
  link.className = 'diary-entry-row__title';
  link.href = `/pages/diary-entry.html?id=${encodeURIComponent(entry.id)}`;
  link.textContent = entry.title;

  const excerpt = document.createElement('p');
  excerpt.className = 'diary-entry-row__excerpt';
  excerpt.textContent = entry.excerpt;

  const meta = document.createElement('div');
  meta.className = 'diary-entry-row__meta';
  if (entry.mood) {
    meta.append(chip(entry.mood.name, 'mood-chip'));
  }
  for (const tag of entry.tags) {
    meta.append(chip(tag.name, 'tag-chip'));
  }
  if (entry.attachmentCount > 0) {
    const attach = document.createElement('span');
    attach.className = 'diary-entry-row__attachments';
    attach.innerHTML = icon('paperclip', { size: 'sm' });
    attach.append(
      document.createTextNode(
        ` ${entry.attachmentCount} ${entry.attachmentCount === 1 ? 'photo' : 'photos'}`,
      ),
    );
    meta.append(attach);
  }

  body.append(link, excerpt, meta);
  item.append(dot, body);
  return item;
}

function renderEntries(items) {
  const container = document.createElement('div');
  container.className = 'timeline';

  // Server already returns newest-first; group by date, then by slot.
  const byDate = new Map();
  for (const entry of items) {
    if (!byDate.has(entry.entryDate)) {
      byDate.set(entry.entryDate, []);
    }
    byDate.get(entry.entryDate).push(entry);
  }

  for (const [date, entries] of byDate) {
    const dateHeader = document.createElement('p');
    dateHeader.className = 'timeline__date';
    dateHeader.textContent = formatLongDate(date);
    container.append(dateHeader);

    for (const slot of TIME_SLOTS) {
      const slotted = entries.filter((entry) => entry.timeOfDay === slot.key);
      if (!slotted.length) {
        continue;
      }
      const slotHeader = document.createElement('p');
      slotHeader.className = 'timeline__slot';
      slotHeader.textContent = slot.label;
      container.append(slotHeader);
      for (const entry of slotted) {
        container.append(buildEntryItem(entry));
      }
    }
  }
  listEl.replaceChildren(container);
}

function renderPagination(data) {
  const showPager = data.totalPages > 1;
  pagerEl.hidden = !showPager;
  if (!showPager) {
    return;
  }
  pageLabelEl.textContent = `Page ${data.page} of ${data.totalPages}`;
  document.querySelector('[data-page-prev]').disabled = data.page <= 1;
  document.querySelector('[data-page-next]').disabled = data.page >= data.totalPages;
}

async function load() {
  listEl.innerHTML = loadingState('Loading entries…');
  pagerEl.hidden = true;
  setStatus(filterStatusEl, '');

  try {
    const data = await listDiary(state);

    if (!data.items.length) {
      pagerEl.hidden = true;
      if (isFiltered()) {
        listEl.innerHTML = emptyState({
          iconName: 'list-checks',
          title: 'No entries match',
          text: 'Try different search terms or clear the filters.',
          action: '<button type="button" class="btn btn--secondary btn--small" data-clear-filters>Clear filters</button>',
        });
        listEl.querySelector('[data-clear-filters]').addEventListener('click', resetFilters);
        setStatus(filterStatusEl, 'No matching entries.');
      } else {
        listEl.innerHTML = emptyState({
          iconName: 'book',
          title: 'No diary entries yet',
          text: 'Write your first entry — it stays private to you.',
          action: '<a class="btn btn--primary btn--small" href="/pages/diary-form.html">Write your first entry</a>',
        });
      }
      return;
    }

    renderEntries(data.items);
    renderPagination(data);
    setStatus(
      filterStatusEl,
      isFiltered()
        ? `${data.total} matching ${data.total === 1 ? 'entry' : 'entries'}`
        : `${data.total} ${data.total === 1 ? 'entry' : 'entries'}`,
    );
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to use the diary.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function readFilters() {
  state.search = filtersForm.search.value.trim();
  state.from = filtersForm.from.value;
  state.to = filtersForm.to.value;
  state.mood = filtersForm.mood.value;
  state.tag = filtersForm.tag.value;
}

function resetFilters() {
  filtersForm.reset();
  readFilters();
  state.page = 1;
  load();
}

async function loadFilterOptions() {
  try {
    const meta = await getDiaryMeta();
    const moodSelect = filtersForm.mood;
    for (const mood of meta.moods) {
      const option = document.createElement('option');
      option.value = mood.id;
      option.textContent = mood.name;
      moodSelect.append(option);
    }
    const tagSelect = filtersForm.tag;
    for (const tag of meta.tags) {
      const option = document.createElement('option');
      option.value = tag.name;
      option.textContent = tag.name;
      tagSelect.append(option);
    }
  } catch {
    // Filters stay usable without the option lists.
  }
}

function wireEvents() {
  filtersForm.addEventListener('submit', (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    load();
  });
  document.querySelector('[data-reset]').addEventListener('click', resetFilters);
  filtersForm.mood.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  filtersForm.tag.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  document.querySelector('[data-page-prev]').addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    load();
  });
  document.querySelector('[data-page-next]').addEventListener('click', () => {
    state.page += 1;
    load();
  });
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  wireEvents();
  await loadFilterOptions();
  await load();
}

init().catch((error) => {
  listEl.innerHTML = errorState(describeError(error));
});
