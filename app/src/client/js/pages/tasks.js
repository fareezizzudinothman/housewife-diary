import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { confirmDialog, openModal } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatDate, isEndOfLocalDay, formatTime, todayString } from '../utils/dates.js';
import {
  listTasks,
  getTaskMeta,
  completeTask,
  updateTask,
  deleteTask,
  listTaskCategories,
  createTaskCategory,
  deleteTaskCategory,
} from '../api/tasks.js';

/* Tasks list — view switcher, compact filters and a calm single-column
   list. All user content is rendered via textContent (never innerHTML). */

const VIEWS = ['today', 'upcoming', 'overdue', 'completed', 'all'];
const PRIORITY_LABELS = { URGENT: 'Urgent', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

const state = {
  view: 'all',
  search: '',
  priority: '',
  category: '',
  sort: 'due',
  page: 1,
  limit: 15,
};

const listEl = document.querySelector('[data-task-list]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const filterStatusEl = document.getElementById('task-filter-status');
const filtersForm = document.getElementById('task-filters');
let categoriesDirty = false;

function isFiltered() {
  return Boolean(state.search || state.priority || state.category);
}

function dueLabel(task) {
  if (!task.dueAt) {
    return { text: 'No due date', overdue: false };
  }
  const due = new Date(task.dueAt);
  const today = todayString();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const todayDay = new Date();
  const diffDays = Math.round((dueDay - new Date(todayDay.getFullYear(), todayDay.getMonth(), todayDay.getDate())) / 86_400_000);
  const allDay = isEndOfLocalDay(task.dueAt);

  let dayText;
  if (diffDays === 0) {
    dayText = 'Today';
  } else if (diffDays === 1) {
    dayText = 'Tomorrow';
  } else if (diffDays === -1) {
    dayText = 'Yesterday';
  } else {
    dayText = formatDate(`${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`);
  }
  const text = allDay ? dayText : `${dayText}, ${formatTime(task.dueAt)}`;
  const open = task.status === 'TODO' || task.status === 'IN_PROGRESS';
  return { text, overdue: open && due.getTime() < Date.now() && !allDay };
}

function chip(text, className) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

async function toggleComplete(task, checkbox) {
  checkbox.disabled = true;
  try {
    if (task.status === 'COMPLETED') {
      await updateTask(task.id, { status: 'TODO' });
    } else {
      await completeTask(task.id);
    }
    await load();
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    toast(describeError(error), { type: 'error' });
  } finally {
    checkbox.disabled = false;
  }
}

async function removeTask(task) {
  const repeating = Boolean(task.recurrence);
  const message = repeating
    ? 'Delete this repeating task and all of its future occurrences?'
    : task.seriesId
      ? 'Delete this occurrence? The rest of the repeating task stays.'
      : 'Delete this task?';
  const confirmed = await confirmDialog({
    title: recurringTitle(task),
    message,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteTask(task.id);
    toast('Task deleted.', { type: 'success' });
    await load();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

function recurringTitle(task) {
  return task.recurrence ? 'Delete repeating task' : 'Delete task';
}

function buildRow(task) {
  const row = document.createElement('div');
  row.className = 'item-row task-row';
  if (task.status === 'COMPLETED') {
    row.classList.add('task-row--completed');
  }

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-row__check';
  checkbox.checked = task.status === 'COMPLETED';
  checkbox.setAttribute('aria-label', `Mark “${task.title}” complete`);
  checkbox.addEventListener('change', () => toggleComplete(task, checkbox));

  const body = document.createElement('div');
  body.className = 'item-info task-row__body';

  const title = document.createElement('a');
  title.className = 'task-row__title';
  title.href = `/pages/task-form.html?id=${encodeURIComponent(task.id)}`;
  title.textContent = task.title;
  body.append(title);

  const meta = document.createElement('div');
  meta.className = 'task-row__meta';

  const due = dueLabel(task);
  const dueEl = chip(due.text, 'task-due');
  if (due.overdue) {
    dueEl.classList.add('task-due--overdue');
  }
  meta.append(dueEl, chip(PRIORITY_LABELS[task.priority] ?? task.priority, `priority-chip priority-chip--${task.priority}`));
  if (task.category) {
    meta.append(chip(task.category.name, 'tag-chip'));
  }
  if (task.assignee) {
    meta.append(chip(task.assignee.name, 'task-meta-text'));
  }
  if (task.repeating) {
    const repeat = document.createElement('span');
    repeat.className = 'task-meta-text task-row__repeat';
    repeat.innerHTML = icon('repeat', { size: 'sm' });
    repeat.append(document.createTextNode(task.recurrence ? ' Repeats' : ' Occurrence'));
    meta.append(repeat);
  }
  if (task.status === 'CANCELLED') {
    meta.append(chip('Cancelled', 'badge'));
  }
  body.append(meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const edit = document.createElement('a');
  edit.className = 'icon-btn';
  edit.href = `/pages/task-form.html?id=${encodeURIComponent(task.id)}`;
  edit.setAttribute('aria-label', `Edit “${task.title}”`);
  edit.innerHTML = icon('pencil');

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', `Delete “${task.title}”`);
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', () => removeTask(task));

  actions.append(edit, remove);
  row.append(checkbox, body, actions);
  return row;
}

function renderTasks(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const task of items) {
    list.append(buildRow(task));
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

function viewEmptyState() {
  if (isFiltered()) {
    return emptyState({
      iconName: 'list-checks',
      title: 'No tasks match',
      text: 'Try different search terms or clear the filters.',
      action: '<button type="button" class="btn btn--secondary btn--small" data-clear-filters>Clear filters</button>',
    });
  }
  if (state.view === 'today') {
    return emptyState({
      iconName: 'check-circle',
      title: 'Nothing due today',
      text: 'Enjoy the quiet, or plan something for later in the week.',
      action: '<a class="btn btn--primary btn--small" href="/pages/task-form.html">Add a task</a>',
    });
  }
  if (state.view === 'overdue') {
    return emptyState({
      iconName: 'check-circle',
      title: 'Nothing overdue',
      text: 'Every task is on track.',
    });
  }
  if (state.view === 'completed') {
    return emptyState({
      iconName: 'list-checks',
      title: 'Nothing completed yet',
      text: 'Finished tasks will collect here.',
    });
  }
  return emptyState({
    iconName: 'list-checks',
    title: 'No tasks yet',
    text: 'Add the first task for your household.',
    action: '<a class="btn btn--primary btn--small" href="/pages/task-form.html">Add a task</a>',
  });
}

async function load() {
  listEl.innerHTML = loadingState('Loading tasks…');
  pagerEl.hidden = true;
  setStatus(filterStatusEl, '');

  try {
    const data = await listTasks(state);
    if (!data.items.length) {
      listEl.innerHTML = viewEmptyState();
      const clear = listEl.querySelector('[data-clear-filters]');
      if (clear) {
        clear.addEventListener('click', resetFilters);
      }
      if (isFiltered()) {
        setStatus(filterStatusEl, 'No matching tasks.');
      }
      return;
    }
    renderTasks(data.items);
    renderPagination(data);
    setStatus(
      filterStatusEl,
      `${data.total} ${data.total === 1 ? 'task' : 'tasks'}${isFiltered() ? ' match' : ''}`,
    );
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to manage tasks.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function readFilters() {
  state.search = filtersForm.search.value.trim();
  state.priority = filtersForm.priority.value;
  state.category = filtersForm.category.value;
  state.sort = filtersForm.sort.value || 'due';
}

function resetFilters() {
  filtersForm.reset();
  readFilters();
  state.page = 1;
  load();
}

function setView(view) {
  if (!VIEWS.includes(view)) {
    return;
  }
  state.view = view;
  for (const button of document.querySelectorAll('[data-view] .segmented__option')) {
    button.setAttribute('aria-pressed', String(button.dataset.value === view));
  }
  state.page = 1;
  load();
}

async function loadCategoryOptions() {
  try {
    const data = await listTaskCategories();
    const select = filtersForm.category;
    select.length = 1;
    for (const category of data.categories) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      select.append(option);
    }
  } catch {
    // The filter stays usable without the option list.
  }
}

// ---- Categories manager ----

function renderCategoryList(container, categories) {
  const list = document.createElement('div');
  list.className = 'item-list';
  if (!categories.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No categories yet.';
    list.append(empty);
  }
  for (const category of categories) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const info = document.createElement('div');
    info.className = 'item-info';
    const name = document.createElement('span');
    name.textContent = category.name;
    const meta = document.createElement('small');
    meta.textContent = `${category.taskCount} ${category.taskCount === 1 ? 'task' : 'tasks'}`;
    info.append(name, meta);

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn icon-btn--danger';
    remove.setAttribute('aria-label', `Delete ${category.name}`);
    remove.innerHTML = icon('trash');
    remove.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Delete category',
        message: `Delete “${category.name}”? Tasks keep their due dates and move to no category.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!confirmed) {
        return;
      }
      try {
        await deleteTaskCategory(category.id);
        categoriesDirty = true;
        await refresh();
      } catch (error) {
        setStatus(statusEl, describeError(error), 'error');
      }
    });
    actions.append(remove);
    row.append(info, actions);
    list.append(row);
  }
  container.replaceChildren(list);
}

async function refresh() {
  const data = await listTaskCategories();
  renderCategoryList(listHost, data.categories);
}

let listHost;
let statusEl;

function manageCategories() {
  const body = document.createElement('div');
  body.innerHTML = `
    <div data-category-list></div>
    <form data-category-add class="form--inline category-add" novalidate>
      <label class="sr-only" for="new-category">New category</label>
      <input type="text" id="new-category" name="name" maxlength="60" placeholder="New category" required>
      <button type="submit" class="btn btn--secondary btn--small">Add</button>
    </form>
    <p class="form-status" data-category-status role="status" aria-live="polite"></p>`;
  listHost = body.querySelector('[data-category-list]');
  statusEl = body.querySelector('[data-category-status]');

  const addForm = body.querySelector('[data-category-add]');
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = addForm.name.value.trim();
    if (!name) {
      return;
    }
    try {
      await createTaskCategory(name);
      addForm.reset();
      setStatus(statusEl, 'Category added.', 'success');
      categoriesDirty = true;
      await refresh();
    } catch (error) {
      setStatus(statusEl, describeError(error), 'error');
    }
  });

  refresh().catch((error) => setStatus(statusEl, describeError(error), 'error'));

  openModal({
    title: 'Task categories',
    body,
    onClose: async () => {
      if (categoriesDirty) {
        categoriesDirty = false;
        await loadCategoryOptions();
        await load();
      }
    },
  });
}

function wireEvents() {
  document.querySelector('[data-view]').addEventListener('click', (event) => {
    const button = event.target.closest('.segmented__option');
    if (button) {
      setView(button.dataset.value);
    }
  });
  filtersForm.addEventListener('submit', (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    load();
  });
  filtersForm.priority.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  filtersForm.category.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  filtersForm.sort.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  document.querySelector('[data-reset]').addEventListener('click', resetFilters);
  document.querySelector('[data-manage-categories]').addEventListener('click', manageCategories);
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
  // Warm the meta call so household errors surface before the list.
  try {
    await getTaskMeta();
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to manage tasks.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
  }
  await loadCategoryOptions();
  await load();
}

init().catch((error) => {
  listEl.innerHTML = errorState(describeError(error));
});
