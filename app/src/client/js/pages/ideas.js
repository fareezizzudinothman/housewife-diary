import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatDate } from '../utils/dates.js';
import {
  listIdeas,
  getIdea,
  createIdea,
  updateIdea,
  deleteIdea,
  generateIdeaTask,
} from '../api/ideas.js';

/* Ideas list — lightweight capture with category, priority, status, cost. */

const IDEA_STATUSES = ['IDEA', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const state = {
  search: '',
  category: '',
  status: '',
  page: 1,
  limit: 20,
};

const listEl = document.querySelector('[data-idea-list]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const filterForm = document.getElementById('idea-filters');
const statusEl = document.getElementById('idea-status');

function isFiltered() {
  return Boolean(state.search || state.category || state.status);
}

function statusChip(status) {
  const labels = {
    IDEA: 'Idea',
    PLANNED: 'Planned',
    IN_PROGRESS: 'In progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  const span = document.createElement('span');
  span.className = `status status--${status === 'COMPLETED' ? 'ok' : status === 'CANCELLED' ? 'error' : status === 'IN_PROGRESS' ? 'info' : status === 'PLANNED' ? 'warn' : 'info'}`;
  span.textContent = labels[status] ?? status;
  return span;
}

function priorityChip(priority) {
  const span = document.createElement('span');
  span.className = `priority-chip priority-chip--${priority}`;
  span.textContent = priority.charAt(0) + priority.slice(1).toLowerCase();
  return span;
}

function buildIdeaRow(idea) {
  const row = document.createElement('div');
  row.className = 'item-row';
  if (idea.status === 'COMPLETED') {
    row.classList.add('item-row--muted');
  }

  const body = document.createElement('div');
  body.className = 'item-info';

  const title = document.createElement('a');
  title.className = 'idea-row__title';
  title.href = `/pages/idea-form.html?id=${encodeURIComponent(idea.id)}`;
  title.textContent = idea.title;
  body.append(title);

  if (idea.description) {
    const desc = document.createElement('small');
    desc.textContent = idea.description;
    desc.style.display = 'block';
    desc.style.marginTop = '0.25rem';
    body.append(desc);
  }

  const meta = document.createElement('div');
  meta.className = 'idea-row__meta';

  if (idea.category) {
    const cat = document.createElement('span');
    cat.className = 'tag-chip';
    cat.textContent = idea.category;
    meta.append(cat);
  }

  meta.append(statusChip(idea.status));
  meta.append(priorityChip(idea.priority));

  if (idea.estimatedCost) {
    const cost = document.createElement('span');
    cost.className = 'task-meta-text';
    cost.textContent = `${idea.currency} ${parseFloat(idea.estimatedCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    meta.append(cost);
  }

  body.append(meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const edit = document.createElement('a');
  edit.className = 'icon-btn';
  edit.href = `/pages/idea-form.html?id=${encodeURIComponent(idea.id)}`;
  edit.setAttribute('aria-label', `Edit ${idea.title}`);
  edit.innerHTML = icon('pencil');

  const taskBtn = document.createElement('button');
  taskBtn.type = 'button';
  taskBtn.className = 'icon-btn';
  taskBtn.setAttribute('aria-label', `Create task from ${idea.title}`);
  taskBtn.innerHTML = icon('list-checks');
  taskBtn.addEventListener('click', () => createTaskFromIdea(idea));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', `Delete ${idea.title}`);
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', () => deleteIdeaHandler(idea));

  actions.append(edit, taskBtn, remove);
  row.append(body, actions);
  return row;
}

function renderIdeas(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const idea of items) {
    list.append(buildIdeaRow(idea));
  }
  listEl.replaceChildren(list);
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

function emptyStateHtml() {
  if (isFiltered()) {
    return emptyState({
      iconName: 'lightbulb',
      title: 'No ideas match',
      text: 'Try different search terms or clear the filters.',
      action: '<button type="button" class="btn btn--secondary btn--small" data-clear-filters>Clear filters</button>',
    });
  }
  return emptyState({
    iconName: 'lightbulb',
    title: 'No ideas yet',
    text: 'Capture your first idea.',
    action: '<a class="btn btn--primary btn--small" href="/pages/idea-form.html">New idea</a>',
  });
}

async function load() {
  listEl.innerHTML = loadingState('Loading ideas…');
  pagerEl.hidden = true;
  setStatus(statusEl, '');

  try {
    const data = await listIdeas(state);
    if (!data.items.length) {
      listEl.innerHTML = emptyStateHtml();
      const clear = listEl.querySelector('[data-clear-filters]');
      if (clear) {
        clear.addEventListener('click', resetFilters);
      }
      if (isFiltered()) {
        setStatus(statusEl, 'No matching ideas.');
      }
      return;
    }
    renderIdeas(data.items);
    renderPagination(data);
    setStatus(
      statusEl,
      `${data.total} ${data.total === 1 ? 'idea' : 'ideas'}${isFiltered() ? ' match' : ''}`,
    );
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to manage ideas.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function readFilters() {
  state.search = filterForm.search.value.trim();
  state.category = filterForm.category.value.trim();
  state.status = filterForm.status.value;
}

function resetFilters() {
  filterForm.reset();
  readFilters();
  state.page = 1;
  load();
}

async function deleteIdeaHandler(idea) {
  const confirmed = await confirmDialog({
    title: 'Delete idea',
    message: `Delete "${idea.title}"?`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteIdea(idea.id);
    toast('Idea deleted.', { type: 'success' });
    await load();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

async function createTaskFromIdea(idea) {
  try {
    await generateIdeaTask(idea.id);
    toast('Task created from idea.', { type: 'success' });
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

function wireEvents() {
  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    load();
  });
  filterForm.status.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  document.querySelector('[data-reset]').addEventListener('click', resetFilters);
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
  await load();
}

init().catch((error) => {
  listEl.innerHTML = errorState(describeError(error));
});