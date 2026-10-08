import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { loadingState, emptyState } from '../components/states.js';
import { describeError } from '../utils/forms.js';
import { formatDate } from '../utils/dates.js';
import {
  listRooms,
  listCleaning,
  listLaundry,
  listMaintenance,
  listDocuments,
} from '../api/home.js';
import { listDocuments as listDocumentsApi } from '../api/documents.js';

/* Home overview page — compact preview cards for each home module. */

const PREVIEW_LIMIT = 3;

const roomsPreviewEl = document.querySelector('[data-rooms-preview]');
const cleaningPreviewEl = document.querySelector('[data-cleaning-preview]');
const laundryPreviewEl = document.querySelector('[data-laundry-preview]');
const maintenancePreviewEl = document.querySelector('[data-maintenance-preview]');
const documentsPreviewEl = document.querySelector('[data-documents-preview]');

function roomChip(text, className) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function buildRoomPreview(room) {
  const link = document.createElement('a');
  link.className = 'module-tile module-tile--link';
  link.href = `/pages/rooms.html`;

  const iconEl = document.createElement('span');
  iconEl.className = 'module-tile__icon';
  iconEl.innerHTML = icon('door', { size: 'sm' });
  link.append(iconEl);

  const label = document.createElement('span');
  label.className = 'module-tile__label';
  label.textContent = room.name;
  link.append(label);

  if (room.description) {
    const meta = document.createElement('small');
    meta.className = 'module-tile__meta';
    meta.textContent = room.description;
    link.append(meta);
  }

  return link;
}

function buildCleaningPreview(cleaning) {
  const link = document.createElement('a');
  link.className = 'module-tile module-tile--link';
  link.href = `/pages/cleaning.html`;

  const iconEl = document.createElement('span');
  iconEl.className = 'module-tile__icon';
  iconEl.innerHTML = icon('broom', { size: 'sm' });
  link.append(iconEl);

  const label = document.createElement('span');
  label.className = 'module-tile__label';
  label.textContent = cleaning.title;
  link.append(label);

  const meta = document.createElement('small');
  meta.className = 'module-tile__meta';
  const parts = [];
  if (cleaning.room) {
    parts.push(cleaning.room.name);
  }
  parts.push(`${cleaning.frequency}${cleaning.interval > 1 ? ` every ${cleaning.interval}` : ''}`);
  if (cleaning.assignedFamilyMember) {
    parts.push(cleaning.assignedFamilyMember.name);
  }
  meta.textContent = parts.join(' · ');
  link.append(meta);

  return link;
}

function buildLaundryPreview(laundry) {
  const link = document.createElement('a');
  link.className = 'module-tile module-tile--link';
  link.href = `/pages/laundry.html`;

  const iconEl = document.createElement('span');
  iconEl.className = 'module-tile__icon';
  iconEl.innerHTML = icon('shirt', { size: 'sm' });
  link.append(iconEl);

  const label = document.createElement('span');
  label.className = 'module-tile__label';
  label.textContent = laundry.category;
  link.append(label);

  const meta = document.createElement('small');
  meta.className = 'module-tile__meta';
  const parts = [];
  parts.push(laundry.status);
  if (laundry.scheduledDate) {
    parts.push(formatDate(laundry.scheduledDate));
  }
  meta.textContent = parts.join(' · ');
  link.append(meta);

  return link;
}

function buildMaintenancePreview(maintenance) {
  const link = document.createElement('a');
  link.className = 'module-tile module-tile--link';
  link.href = `/pages/maintenance.html`;

  const iconEl = document.createElement('span');
  iconEl.className = 'module-tile__icon';
  iconEl.innerHTML = icon('wrench', { size: 'sm' });
  link.append(iconEl);

  const label = document.createElement('span');
  label.className = 'module-tile__label';
  label.textContent = maintenance.title;
  link.append(label);

  const meta = document.createElement('small');
  meta.className = 'module-tile__meta';
  const parts = [];
  parts.push(maintenance.status);
  if (maintenance.room) {
    parts.push(maintenance.room.name);
  }
  if (maintenance.scheduledDate) {
    parts.push(formatDate(maintenance.scheduledDate));
  }
  meta.textContent = parts.join(' · ');
  link.append(meta);

  return link;
}

function buildDocumentPreview(doc) {
  const link = document.createElement('a');
  link.className = 'module-tile module-tile--link';
  link.href = `/pages/documents.html`;

  const iconEl = document.createElement('span');
  iconEl.className = 'module-tile__icon';
  iconEl.innerHTML = icon('file-stack', { size: 'sm' });
  link.append(iconEl);

  const label = document.createElement('span');
  label.className = 'module-tile__label';
  label.textContent = doc.title;
  link.append(label);

  const meta = document.createElement('small');
  meta.className = 'module-tile__meta';
  const parts = [doc.category];
  if (doc.expiryDate) {
    parts.push(`Expires ${formatDate(doc.expiryDate)}`);
  }
  meta.textContent = parts.join(' · ');
  link.append(meta);

  return link;
}

function renderPreview(container, items, builder, emptyMessage, emptyAction) {
  if (!items.length) {
    container.innerHTML = emptyState({
      iconName: 'package',
      title: emptyMessage,
      text: 'No items yet.',
      action: emptyAction,
    }).innerHTML;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'module-grid';
  for (const item of items.slice(0, PREVIEW_LIMIT)) {
    grid.append(builder(item));
  }
  container.replaceChildren(grid);
}

async function loadPreviews() {
  const previews = [
    { el: roomsPreviewEl, loader: () => listRooms({ limit: PREVIEW_LIMIT, active: true }), builder: buildRoomPreview, empty: 'No rooms defined', action: '<a class="btn btn--primary btn--small" href="/pages/rooms.html">Add a room</a>' },
    { el: cleaningPreviewEl, loader: () => listCleaning({ limit: PREVIEW_LIMIT, status: 'ACTIVE' }), builder: buildCleaningPreview, empty: 'No cleaning schedules', action: '<a class="btn btn--primary btn--small" href="/pages/cleaning.html">Add a schedule</a>' },
    { el: laundryPreviewEl, loader: () => listLaundry({ limit: PREVIEW_LIMIT }), builder: buildLaundryPreview, empty: 'No laundry loads', action: '<a class="btn btn--primary btn--small" href="/pages/laundry.html">Add laundry</a>' },
    { el: maintenancePreviewEl, loader: () => listMaintenance({ limit: PREVIEW_LIMIT }), builder: buildMaintenancePreview, empty: 'No maintenance items', action: '<a class="btn btn--primary btn--small" href="/pages/maintenance.html">Add maintenance</a>' },
    { el: documentsPreviewEl, loader: () => listDocumentsApi({ limit: PREVIEW_LIMIT }), builder: buildDocumentPreview, empty: 'No documents', action: '<a class="btn btn--primary btn--small" href="/pages/documents.html">Upload document</a>' },
  ];

  for (const preview of previews) {
    preview.el.innerHTML = loadingState('Loading…');
    try {
      const data = await preview.loader();
      renderPreview(preview.el, data.items, preview.builder, preview.empty, preview.action);
    } catch (error) {
      if (error?.status === 403) {
        preview.el.innerHTML = `
          <div class="alert alert--warning" role="alert">
            <strong>No active household.</strong> Create or join a household to manage home.
            <a href="/pages/household.html">Set up a household</a>
          </div>`;
        return;
      }
      preview.el.innerHTML = emptyState({
        iconName: 'alert-circle',
        title: 'Failed to load',
        text: describeError(error),
      }).innerHTML;
    }
  }
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  await loadPreviews();
}

init().catch((error) => {
  console.error('Home page init failed:', error);
});