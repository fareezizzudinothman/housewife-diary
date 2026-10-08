import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { describeError, setStatus } from '../utils/forms.js';
import { formatDate, formatTime } from '../utils/dates.js';
import {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  archiveNotification,
  deleteNotification,
} from '../api/notifications.js';

/* Notifications page — in-app notification center. */

const state = {
  unreadOnly: false,
  includeArchived: false,
  page: 1,
  limit: 20,
};

const listEl = document.querySelector('[data-notification-list]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const filterForm = document.getElementById('notification-filters');
const statusEl = document.getElementById('notification-status');
const markAllReadBtn = document.querySelector('[data-mark-all-read]');

function isFiltered() {
  return state.unreadOnly || state.includeArchived;
}

function typeIcon(type) {
  const icons = {
    TASK_DUE: 'list-checks',
    TASK_OVERDUE: 'alert-circle',
    BILL_DUE: 'credit-card',
    BILL_OVERDUE: 'alert-circle',
    INVENTORY_EXPIRING: 'package',
    INVENTORY_EXPIRED: 'alert-circle',
    DOCUMENT_EXPIRING: 'file-stack',
    DOCUMENT_EXPIRED: 'alert-circle',
    FAMILY_BIRTHDAY: 'calendar',
    MAINTENANCE_DUE: 'wrench',
  };
  return icons[type] || 'info';
}

function typeLabel(type) {
  const labels = {
    TASK_DUE: 'Task due',
    TASK_OVERDUE: 'Task overdue',
    BILL_DUE: 'Bill due',
    BILL_OVERDUE: 'Bill overdue',
    INVENTORY_EXPIRING: 'Item expiring',
    INVENTORY_EXPIRED: 'Item expired',
    DOCUMENT_EXPIRING: 'Document expiring',
    DOCUMENT_EXPIRED: 'Document expired',
    FAMILY_BIRTHDAY: 'Birthday',
    MAINTENANCE_DUE: 'Maintenance due',
  };
  return labels[type] || type;
}

function buildNotificationRow(notification) {
  const row = document.createElement('div');
  row.className = 'item-row';
  if (!notification.readAt) {
    row.classList.add('item-row--unread');
  }
  if (notification.archivedAt) {
    row.classList.add('item-row--muted');
  }

  const body = document.createElement('div');
  body.className = 'item-info';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.gap = '0.5rem';
  header.style.flexWrap = 'wrap';

  const iconEl = document.createElement('span');
  iconEl.className = 'notification-icon';
  iconEl.innerHTML = icon(typeIcon(notification.type), { size: 'sm' });
  header.append(iconEl);

  const typeBadge = document.createElement('span');
  typeBadge.className = 'tag-chip';
  typeBadge.textContent = typeLabel(notification.type);
  header.append(typeBadge);

  const title = document.createElement('strong');
  title.textContent = notification.title;
  header.append(title);

  body.append(header);

  if (notification.message) {
    const message = document.createElement('p');
    message.className = 'notification-message';
    message.textContent = notification.message;
    body.append(message);
  }

  const meta = document.createElement('div');
  meta.className = 'notification-meta';
  meta.style.marginTop = '0.35rem';

  const time = document.createElement('small');
  time.textContent = `${formatDate(notification.createdAt.toISOString().slice(0, 10))} ${formatTime(notification.createdAt)}`;
  meta.append(time);

  if (notification.readAt) {
    const read = document.createElement('small');
    read.className = 'notification-read';
    read.textContent = 'Read';
    meta.append(read);
  }

  if (notification.archivedAt) {
    const archived = document.createElement('small');
    archived.className = 'notification-archived';
    archived.textContent = 'Archived';
    meta.append(archived);
  }

  body.append(meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  if (!notification.readAt) {
    const markRead = document.createElement('button');
    markRead.type = 'button';
    markRead.className = 'icon-btn';
    markRead.setAttribute('aria-label', 'Mark as read');
    markRead.innerHTML = icon('check');
    markRead.addEventListener('click', () => handleMarkRead(notification));
    actions.append(markRead);
  }

  if (!notification.archivedAt) {
    const archive = document.createElement('button');
    archive.type = 'button';
    archive.className = 'icon-btn';
    archive.setAttribute('aria-label', 'Archive');
    archive.innerHTML = icon('archive');
    archive.addEventListener('click', () => handleArchive(notification));
    actions.append(archive);
  }

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn icon-btn--danger';
  remove.setAttribute('aria-label', 'Delete');
  remove.innerHTML = icon('trash');
  remove.addEventListener('click', () => handleDelete(notification));
  actions.append(remove);

  row.append(body, actions);
  return row;
}

function renderNotifications(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const notification of items) {
    list.append(buildNotificationRow(notification));
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
      iconName: 'info',
      title: 'No notifications match',
      text: 'Try different filters or clear them.',
      action: '<button type="button" class="btn btn--secondary btn--small" data-clear-filters>Clear filters</button>',
    });
  }
  return emptyState({
    iconName: 'info',
    title: 'No notifications',
    text: 'You\'re all caught up!',
  });
}

async function loadUnreadCount() {
  try {
    const data = await getUnreadCount();
    const badge = document.querySelector('[data-unread-badge]');
    if (badge) {
      if (data.count > 0) {
        badge.textContent = data.count > 99 ? '99+' : data.count;
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    }
    if (data.count > 0) {
      markAllReadBtn.hidden = false;
    } else {
      markAllReadBtn.hidden = true;
    }
  } catch (error) {
    console.error('Failed to load unread count:', error);
  }
}

async function load() {
  listEl.innerHTML = loadingState('Loading notifications…');
  pagerEl.hidden = true;
  setStatus(statusEl, '');

  try {
    const data = await listNotifications(state);
    if (!data.items.length) {
      listEl.innerHTML = emptyStateHtml();
      const clear = listEl.querySelector('[data-clear-filters]');
      if (clear) {
        clear.addEventListener('click', resetFilters);
      }
      if (isFiltered()) {
        setStatus(statusEl, 'No matching notifications.');
      }
    } else {
      renderNotifications(data.items);
      renderPagination(data);
    }
    setStatus(
      statusEl,
      `${data.total} ${data.total === 1 ? 'notification' : 'notifications'}${isFiltered() ? ' match' : ''}`,
    );
    await loadUnreadCount();
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to manage notifications.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function readFilters() {
  state.unreadOnly = filterForm.unreadOnly.value === 'true';
  state.includeArchived = filterForm.includeArchived.value === 'true';
}

function resetFilters() {
  filterForm.reset();
  readFilters();
  state.page = 1;
  load();
}

async function handleMarkRead(notification) {
  try {
    await markRead(notification.id);
    toast('Marked as read.', { type: 'success' });
    await load();
    await loadUnreadCount();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

async function handleMarkAllRead() {
  try {
    await markAllRead();
    toast('All notifications marked as read.', { type: 'success' });
    await load();
    await loadUnreadCount();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

async function handleArchive(notification) {
  try {
    await archiveNotification(notification.id);
    toast('Notification archived.', { type: 'success' });
    await load();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

async function handleDelete(notification) {
  try {
    await deleteNotification(notification.id);
    toast('Notification deleted.', { type: 'success' });
    await load();
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
  filterForm.unreadOnly.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  filterForm.includeArchived.addEventListener('change', () => {
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
  markAllReadBtn.addEventListener('click', handleMarkAllRead);
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  wireEvents();
  await load();
  await loadUnreadCount();
}

init().catch((error) => {
  listEl.innerHTML = errorState(describeError(error));
});