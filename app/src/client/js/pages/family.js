import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { confirmDialog, openModal } from '../components/modal.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatDate, todayString } from '../utils/dates.js';
import {
  getMeta,
  listMembers,
  getMember,
  createMember,
  updateMember,
  archiveMember,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
} from '../api/family.js';

/* Family page — members and events in a calm two-section layout. */

const state = {
  members: {
    search: '',
    includeArchived: false,
    page: 1,
    limit: 24,
  },
  events: {
    from: '',
    to: '',
    memberId: '',
    page: 1,
    limit: 24,
  },
};

const memberListEl = document.querySelector('[data-member-list]');
const memberPagerEl = document.querySelector('[data-pager]');
const memberPageLabelEl = document.querySelector('[data-page-label]');
const memberFilterForm = document.getElementById('family-filters');
const memberStatusEl = document.getElementById('family-status');

const eventListEl = document.querySelector('[data-event-list]');
const eventPagerEl = document.querySelector('[data-event-pager]');
const eventPageLabelEl = document.querySelector('[data-event-page-label]');
const eventFilterForm = document.getElementById('event-filters');
const eventStatusEl = document.getElementById('event-status');
const eventMemberSelect = document.getElementById('event-filter-member');

let memberCache = [];

function isMemberFiltered() {
  return Boolean(state.members.search || state.members.includeArchived);
}

function memberChip(text, className) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function buildMemberRow(member) {
  const row = document.createElement('div');
  row.className = 'item-row';
  if (!member.active) {
    row.classList.add('item-row--muted');
  }

  const body = document.createElement('div');
  body.className = 'item-info';

  const title = document.createElement('a');
  title.className = 'family-row__title';
  title.href = `/pages/family-member-form.html?id=${encodeURIComponent(member.id)}`;
  title.textContent = member.name;
  body.append(title);

  const meta = document.createElement('div');
  meta.className = 'family-row__meta';

  meta.append(memberChip(member.relationship, 'tag-chip'));

  if (member.dateOfBirth) {
    const birth = document.createElement('span');
    birth.className = 'family-meta-text';
    birth.textContent = `Born ${formatDate(member.dateOfBirth)}`;
    meta.append(birth);
    const age = calculateAge(member.dateOfBirth);
    if (age !== null) {
      const ageEl = document.createElement('span');
      ageEl.className = 'family-meta-text';
      ageEl.textContent = `${age} years`;
      meta.append(ageEl);
    }
  }

  if (member.notes) {
    const notes = document.createElement('small');
    notes.className = 'family-meta-text';
    notes.textContent = member.notes;
    meta.append(notes);
  }

  if (member.linkedUser) {
    const linked = document.createElement('span');
    linked.className = 'family-meta-text';
    linked.innerHTML = `${icon('user', { size: 'sm' })} Linked: ${member.linkedUser.name}`;
    meta.append(linked);
  }

  body.append(meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const edit = document.createElement('a');
  edit.className = 'icon-btn';
  edit.href = `/pages/family-member-form.html?id=${encodeURIComponent(member.id)}`;
  edit.setAttribute('aria-label', `Edit ${member.name}`);
  edit.innerHTML = icon('pencil');

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', member.active ? `Archive ${member.name}` : `Restore ${member.name}`);
  remove.innerHTML = member.active ? icon('archive') : icon('user');
  remove.addEventListener('click', () => toggleArchive(member));

  actions.append(edit, remove);
  row.append(body, actions);
  return row;
}

function calculateAge(dateString) {
  const birth = new Date(dateString);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

function renderMembers(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const member of items) {
    list.append(buildMemberRow(member));
  }
  memberListEl.replaceChildren(list);
}

function renderMemberPagination(data) {
  const showPager = data.totalPages > 1;
  memberPagerEl.hidden = !showPager;
  if (!showPager) {
    return;
  }
  memberPageLabelEl.textContent = `Page ${data.page} of ${data.totalPages}`;
  document.querySelector('[data-page-prev]').disabled = data.page <= 1;
  document.querySelector('[data-page-next]').disabled = data.page >= data.totalPages;
}

function memberEmptyState() {
  if (isMemberFiltered()) {
    return emptyState({
      iconName: 'user-group',
      title: 'No members match',
      text: 'Try different search terms or clear the filters.',
      action: '<button type="button" class="btn btn--secondary btn--small" data-clear-member-filters>Clear filters</button>',
    });
  }
  return emptyState({
    iconName: 'user-group',
    title: 'No family members yet',
    text: 'Add your first family member to get started.',
    action: '<a class="btn btn--primary btn--small" href="/pages/family-member-form.html">Add a member</a>',
  });
}

async function loadMembers() {
  memberListEl.innerHTML = loadingState('Loading family members…');
  memberPagerEl.hidden = true;
  setStatus(memberStatusEl, '');

  try {
    const data = await listMembers(state.members);
    memberCache = data.items;
    if (!data.items.length) {
      memberListEl.innerHTML = memberEmptyState();
      const clear = memberListEl.querySelector('[data-clear-member-filters]');
      if (clear) {
        clear.addEventListener('click', resetMemberFilters);
      }
      if (isMemberFiltered()) {
        setStatus(memberStatusEl, 'No matching members.');
      }
      return;
    }
    renderMembers(data.items);
    renderMemberPagination(data);
    updateEventMemberOptions(data.items);
    setStatus(
      memberStatusEl,
      `${data.total} ${data.total === 1 ? 'member' : 'members'}${isMemberFiltered() ? ' match' : ''}`,
    );
  } catch (error) {
    if (error?.status === 403) {
      memberListEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to manage family.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    memberListEl.innerHTML = errorState(describeError(error));
  }
}

function updateEventMemberOptions(members) {
  eventMemberSelect.length = 1;
  for (const member of members) {
    if (member.active) {
      const option = document.createElement('option');
      option.value = member.id;
      option.textContent = member.name;
      eventMemberSelect.append(option);
    }
  }
}

function readMemberFilters() {
  state.members.search = memberFilterForm.search.value.trim();
  state.members.includeArchived = memberFilterForm.includeArchived.value === 'true';
}

function resetMemberFilters() {
  memberFilterForm.reset();
  readMemberFilters();
  state.members.page = 1;
  loadMembers();
}

function readEventFilters() {
  state.events.from = eventFilterForm.from.value;
  state.events.to = eventFilterForm.to.value;
  state.events.memberId = eventFilterForm.memberId.value;
}

function resetEventFilters() {
  eventFilterForm.reset();
  readEventFilters();
  state.events.page = 1;
  loadEvents();
}

async function toggleArchive(member) {
  const confirmed = await confirmDialog({
    title: member.active ? 'Archive member' : 'Restore member',
    message: member.active
      ? `Archive "${member.name}"? They will be hidden from lists but can be restored.`
      : `Restore "${member.name}"? They will reappear in active lists.`,
    confirmLabel: member.active ? 'Archive' : 'Restore',
    danger: member.active,
  });
  if (!confirmed) {
    return;
  }
  try {
    await archiveMember(member.id);
    toast(member.active ? 'Member archived.' : 'Member restored.', { type: 'success' });
    await loadMembers();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

function buildEventRow(event) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const body = document.createElement('div');
  body.className = 'item-info';

  const title = document.createElement('a');
  title.className = 'event-row__title';
  title.href = `/pages/event-form.html?id=${encodeURIComponent(event.id)}&type=family`;
  title.textContent = event.title;
  body.append(title);

  const meta = document.createElement('div');
  meta.className = 'event-row__meta';

  const date = document.createElement('span');
  date.className = 'event-meta-text';
  date.textContent = formatDate(event.eventDate);
  meta.append(date);

  if (event.member) {
    const member = document.createElement('span');
    member.className = 'event-meta-text';
    member.textContent = event.member.name;
    meta.append(member);
  }

  const kind = document.createElement('span');
  kind.className = 'tag-chip';
  kind.textContent = event.kind;
  meta.append(kind);

  if (event.repeatsYearly) {
    const repeat = document.createElement('span');
    repeat.className = 'event-meta-text';
    repeat.innerHTML = `${icon('repeat', { size: 'sm' })} Yearly`;
    meta.append(repeat);
  }

  if (event.notes) {
    const notes = document.createElement('small');
    notes.className = 'event-meta-text';
    notes.textContent = event.notes;
    meta.append(notes);
  }

  body.append(meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const edit = document.createElement('a');
  edit.className = 'icon-btn';
  edit.href = `/pages/event-form.html?id=${encodeURIComponent(event.id)}&type=family`;
  edit.setAttribute('aria-label', `Edit ${event.title}`);
  edit.innerHTML = icon('pencil');

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', `Delete ${event.title}`);
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', () => deleteEventHandler(event));

  actions.append(edit, remove);
  row.append(body, actions);
  return row;
}

async function deleteEventHandler(event) {
  const confirmed = await confirmDialog({
    title: 'Delete event',
    message: `Delete "${event.title}"?`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteEvent(event.id);
    toast('Event deleted.', { type: 'success' });
    await loadEvents();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

function renderEvents(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const event of items) {
    list.append(buildEventRow(event));
  }
  eventListEl.replaceChildren(list);
}

function renderEventPagination(data) {
  const showPager = data.totalPages > 1;
  eventPagerEl.hidden = !showPager;
  if (!showPager) {
    return;
  }
  eventPageLabelEl.textContent = `Page ${data.page} of ${data.totalPages}`;
  document.querySelector('[data-event-page-prev]').disabled = data.page <= 1;
  document.querySelector('[data-event-page-next]').disabled = data.page >= data.totalPages;
}

function eventEmptyState() {
  return emptyState({
    iconName: 'calendar',
    title: 'No events yet',
    text: 'Add birthdays, anniversaries, or other family dates.',
    action: '<a class="btn btn--primary btn--small" href="/pages/event-form.html?type=family">Add an event</a>',
  });
}

async function loadEvents() {
  eventListEl.innerHTML = loadingState('Loading events…');
  eventPagerEl.hidden = true;
  setStatus(eventStatusEl, '');

  try {
    const data = await listEvents(state.events);
    if (!data.items.length) {
      eventListEl.innerHTML = eventEmptyState();
      return;
    }
    renderEvents(data.items);
    renderEventPagination(data);
    setStatus(eventStatusEl, `${data.total} ${data.total === 1 ? 'event' : 'events'}`);
  } catch (error) {
    if (error?.status === 403) {
      eventListEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to manage events.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    eventListEl.innerHTML = errorState(describeError(error));
  }
}

function wireEvents() {
  memberFilterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    readMemberFilters();
    state.members.page = 1;
    loadMembers();
  });
  memberFilterForm.includeArchived.addEventListener('change', () => {
    readMemberFilters();
    state.members.page = 1;
    loadMembers();
  });
  document.querySelector('[data-reset]').addEventListener('click', resetMemberFilters);
  document.querySelector('[data-page-prev]').addEventListener('click', () => {
    state.members.page = Math.max(1, state.members.page - 1);
    loadMembers();
  });
  document.querySelector('[data-page-next]').addEventListener('click', () => {
    state.members.page += 1;
    loadMembers();
  });

  eventFilterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    readEventFilters();
    state.events.page = 1;
    loadEvents();
  });
  document.querySelector('[data-event-reset]').addEventListener('click', resetEventFilters);
  document.querySelector('[data-event-page-prev]').addEventListener('click', () => {
    state.events.page = Math.max(1, state.events.page - 1);
    loadEvents();
  });
  document.querySelector('[data-event-page-next]').addEventListener('click', () => {
    state.events.page += 1;
    loadEvents();
  });
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  wireEvents();
  await loadMembers();
  await loadEvents();
}

init().catch((error) => {
  memberListEl.innerHTML = errorState(describeError(error));
});