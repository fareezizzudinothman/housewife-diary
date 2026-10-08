import { AppError, ErrorCodes } from '../../shared/errors.js';
import { fieldError, throwValidationError } from '../validators/shared.js';
import { occurrenceDates, DAY_MS } from '../utils/recurrence.js';
import { toDateString } from '../utils/time.js';
import * as homeRepository from '../repositories/homeRepository.js';
import * as taskRepository from '../repositories/taskRepository.js';
import * as taskService from './taskService.js';
import * as familyRepository from '../repositories/familyRepository.js';
import * as financeRepository from '../repositories/financeRepository.js';

const NEXT_DUE_WINDOW_DAYS = 90;

function notFound(message = 'Record not found.') {
  return new AppError(message, { code: ErrorCodes.NOT_FOUND, status: 404 });
}

function conflict(message, field) {
  return new AppError(message, {
    code: ErrorCodes.CONFLICT,
    status: 409,
    details: [fieldError(field, message)],
  });
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function paginate(total, page, limit) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function toRoomView(room) {
  return {
    id: room.id,
    name: room.name,
    description: room.description ?? null,
    active: room.active,
    cleaningCount: room._count ? room._count.cleaning : room.cleaning?.length ?? 0,
    maintenanceCount: room._count ? room._count.maintenance : room.maintenance?.length ?? 0,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  };
}

async function assertRoom(roomId, householdId) {
  if (roomId === null || roomId === undefined) {
    return null;
  }
  const room = await homeRepository.findRoomById(roomId, householdId);
  if (!room) {
    throwValidationError([fieldError('roomId', 'Choose a room.')]);
  }
  return roomId;
}

async function assertFamilyAssignee(assignedFamilyMemberId, householdId) {
  if (assignedFamilyMemberId === null || assignedFamilyMemberId === undefined) {
    return null;
  }
  const member = await familyRepository.findMemberById(assignedFamilyMemberId, householdId);
  if (!member || !member.active) {
    throwValidationError([
      fieldError('assignedFamilyMemberId', 'Choose an active family member.'),
    ]);
  }
  return assignedFamilyMemberId;
}

// The next due date for an ACTIVE definition, derived from its generated task
// series so definitions and tasks can never disagree. Written through to the
// definition row so the dashboard's "due" count stays cheap to compute.
function nextOccurrenceDate(head) {
  if (!head?.recurrence) {
    return null;
  }
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const to = new Date(from.getTime() + NEXT_DUE_WINDOW_DAYS * DAY_MS);
  const dates = occurrenceDates(head.recurrence, { start: head.dueAt, from, to, limit: 1 });
  return dates.length ? dates[0] : null;
}

function lastCompletedFromOccurrences(occurrences) {
  const completed = occurrences.filter((occurrence) => occurrence.completedAt);
  if (!completed.length) {
    return null;
  }
  return completed.reduce((latest, occurrence) =>
    occurrence.completedAt > latest.completedAt ? occurrence : latest,
  ).completedAt;
}

async function resolveCleaningDates(cleaning, householdId) {
  if (cleaning.status !== 'ACTIVE') {
    return { nextDueAt: null, lastCompletedAt: null };
  }
  const head = await taskRepository.findTaskBySource(householdId, 'CLEANING', cleaning.id);
  if (!head?.recurrence) {
    return { nextDueAt: null, lastCompletedAt: null };
  }
  const occurrences = await taskRepository.listSeriesOccurrences(householdId, head.id);
  return {
    nextDueAt: nextOccurrenceDate(head),
    lastCompletedAt: lastCompletedFromOccurrences(occurrences),
  };
}

function withCleaningDates(cleaning, { nextDueAt, lastCompletedAt }) {
  return {
    ...toCleaningView(cleaning),
    assignedFamilyMemberId: cleaning.assignedFamilyMemberId ?? null,
    assignedFamilyMember: cleaning.assignedFamilyMember
      ? { id: cleaning.assignedFamilyMember.id, name: cleaning.assignedFamilyMember.name }
      : null,
    nextDueAt: nextDueAt ? isoDate(nextDueAt) : null,
    lastCompletedAt: lastCompletedAt ? lastCompletedAt.toISOString() : null,
  };
}

function toCleaningView(cleaning) {
  return {
    id: cleaning.id,
    roomId: cleaning.roomId,
    room: cleaning.room ? { id: cleaning.room.id, name: cleaning.room.name } : null,
    title: cleaning.title,
    frequency: cleaning.frequency,
    interval: cleaning.interval,
    status: cleaning.status,
    notes: cleaning.notes ?? null,
    createdAt: cleaning.createdAt.toISOString(),
    updatedAt: cleaning.updatedAt.toISOString(),
  };
}

function toLaundryView(item) {
  return {
    id: item.id,
    category: item.category,
    status: item.status,
    scheduledDate: item.scheduledDate ? isoDate(item.scheduledDate) : null,
    notes: item.notes ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toMaintenanceView(maintenance) {
  return {
    id: maintenance.id,
    roomId: maintenance.roomId ?? null,
    room: maintenance.room ? { id: maintenance.room.id, name: maintenance.room.name } : null,
    title: maintenance.title,
    description: maintenance.description ?? null,
    category: maintenance.category,
    priority: maintenance.priority,
    status: maintenance.status,
    scheduledDate: isoDate(maintenance.scheduledDate),
    completedAt: maintenance.completedAt ? maintenance.completedAt.toISOString() : null,
    transactionId: maintenance.transactionId ?? null,
    notes: maintenance.notes ?? null,
    createdAt: maintenance.createdAt.toISOString(),
    updatedAt: maintenance.updatedAt.toISOString(),
  };
}

// ---- Rooms ----

export async function listRooms({ householdId, query }) {
  const [items, total] = await Promise.all([
    homeRepository.listRooms(householdId, query),
    homeRepository.countRooms(householdId, query),
  ]);
  return { items: items.map(toRoomView), ...paginate(total, query.page, query.limit) };
}

export async function getRoom({ householdId, id }) {
  const room = await homeRepository.findRoomById(id, householdId);
  if (!room) {
    throw notFound('Room not found.');
  }
  return toRoomView(room);
}

export async function createRoom({ user, householdId, data }) {
  const normalized = data.name.toLowerCase();
  const existing = await homeRepository.listRooms(householdId, {
    search: normalized,
    active: undefined,
    page: 1,
    limit: 1,
  });
  if (existing.length && existing[0].name.toLowerCase() === normalized) {
    throw conflict('A room with this name already exists.', 'name');
  }
  const room = await homeRepository.createRoom({
    householdId,
    createdById: user.id,
    name: data.name,
    normalized,
    description: data.description,
  });
  return toRoomView(room);
}

export async function updateRoom({ householdId, id, patch }) {
  const room = await homeRepository.findRoomById(id, householdId);
  if (!room) {
    throw notFound('Room not found.');
  }
  const data = {};
  if (patch.name !== undefined) {
    data.name = patch.name;
    data.normalized = patch.name.toLowerCase();
    if (room.name.toLowerCase() !== data.normalized) {
      const duplicate = await homeRepository.countRooms(householdId, {
        search: data.normalized,
        active: undefined,
      });
      if (duplicate > 0) {
        throw conflict('A room with this name already exists.', 'name');
      }
    }
  }
  if (patch.description !== undefined) {
    data.description = patch.description;
  }
  if (patch.active !== undefined) {
    data.active = patch.active;
  }
  const updated = await homeRepository.updateRoom(id, data);
  return toRoomView(updated);
}

export async function deleteRoom({ householdId, id }) {
  const room = await homeRepository.findRoomById(id, householdId);
  if (!room) {
    throw notFound('Room not found.');
  }
  if (room.cleaning.length > 0) {
    throw conflict('Remove this room’s cleaning schedules before deleting it.', 'id');
  }
  await homeRepository.deleteRoom(id);
  return { deleted: true, id };
}

// ---- Cleaning ----

async function headTaskFor(cleaning, householdId) {
  return taskRepository.findTaskBySource(householdId, 'CLEANING', cleaning.id);
}

async function createCleaningSeries(user, householdId, cleaning) {
  const today = toDateString(new Date(), user.timezone ?? 'UTC');
  await taskService.createTask({
    user,
    householdId,
    data: {
      title: cleaning.title,
      assignedFamilyMemberId: cleaning.assignedFamilyMemberId,
      recurrence: { frequency: cleaning.frequency, interval: cleaning.interval },
      dueDate: today,
    },
    source: { type: 'CLEANING', id: cleaning.id },
  });
}

export async function listCleaning({ householdId, query }) {
  const [rows, total] = await Promise.all([
    homeRepository.listCleaning(householdId, query),
    homeRepository.countCleaning(householdId, query),
  ]);

  const dated = await Promise.all(
    rows.map(async (cleaning) => {
      const dates = await resolveCleaningDates(cleaning, householdId);
      await homeRepository.updateCleaningDates(cleaning.id, {
        nextDueAt: dates.nextDueAt,
        lastCompletedAt: dates.lastCompletedAt,
      });
      return withCleaningDates(cleaning, dates);
    }),
  );

  return { items: dated, ...paginate(total, query.page, query.limit) };
}

export async function getCleaning({ householdId, id }) {
  const cleaning = await homeRepository.findCleaningById(id, householdId);
  if (!cleaning) {
    throw notFound('Cleaning schedule not found.');
  }
  const dates = await resolveCleaningDates(cleaning, householdId);
  return withCleaningDates(cleaning, dates);
}

export async function createCleaning({ user, householdId, data }) {
  await assertRoom(data.roomId, householdId);
  const assignedFamilyMemberId = await assertFamilyAssignee(
    data.assignedFamilyMemberId,
    householdId,
  );
  const cleaning = await homeRepository.createCleaning({
    householdId,
    createdById: user.id,
    roomId: data.roomId,
    title: data.title,
    frequency: data.frequency,
    interval: data.interval,
    status: data.status,
    assignedFamilyMemberId,
    notes: data.notes,
  });

  let dates = { nextDueAt: null, lastCompletedAt: null };
  if (cleaning.status === 'ACTIVE') {
    await createCleaningSeries(user, householdId, cleaning);
    dates = await resolveCleaningDates(cleaning, householdId);
    await homeRepository.updateCleaningDates(cleaning.id, dates);
  }
  return withCleaningDates(cleaning, dates);
}

export async function updateCleaning({ user, householdId, id, patch }) {
  const cleaning = await homeRepository.findCleaningById(id, householdId);
  if (!cleaning) {
    throw notFound('Cleaning schedule not found.');
  }

  const data = {};
  if (patch.title !== undefined) {
    data.title = patch.title;
  }
  if (patch.frequency !== undefined) {
    data.frequency = patch.frequency;
  }
  if (patch.interval !== undefined) {
    data.interval = patch.interval;
  }
  if (patch.status !== undefined) {
    data.status = patch.status;
  }
  if (patch.roomId !== undefined) {
    data.roomId = await assertRoom(patch.roomId, householdId);
  }
  if (patch.assignedFamilyMemberId !== undefined) {
    data.assignedFamilyMemberId = await assertFamilyAssignee(
      patch.assignedFamilyMemberId,
      householdId,
    );
  }
  if (patch.notes !== undefined) {
    data.notes = patch.notes;
  }

  const wasActive = cleaning.status === 'ACTIVE';
  const willBeActive = (data.status ?? cleaning.status) === 'ACTIVE';
  const updated = await homeRepository.updateCleaning(id, data);

  if (wasActive && !willBeActive) {
    await taskRepository.deleteTasksBySource(householdId, 'CLEANING', id);
    await homeRepository.updateCleaningDates(id, { nextDueAt: null, lastCompletedAt: null });
  } else if (!wasActive && willBeActive) {
    await createCleaningSeries(user, householdId, updated);
  } else if (wasActive && willBeActive) {
    const head = await headTaskFor(updated, householdId);
    if (head) {
      const taskPatch = {};
      if (patch.title !== undefined) {
        taskPatch.title = patch.title;
      }
      if (patch.assignedFamilyMemberId !== undefined) {
        taskPatch.assignedFamilyMemberId = patch.assignedFamilyMemberId;
      }
      if (patch.frequency !== undefined || patch.interval !== undefined) {
        taskPatch.recurrence = {
          frequency: data.frequency ?? cleaning.frequency,
          interval: data.interval ?? cleaning.interval,
        };
      }
      if (Object.keys(taskPatch).length) {
        await taskService.updateTask({
          user,
          householdId,
          id: head.id,
          patch: taskPatch,
        });
      }
    }
  }

  const dates = willBeActive
    ? await resolveCleaningDates(updated, householdId)
    : { nextDueAt: null, lastCompletedAt: null };
  await homeRepository.updateCleaningDates(id, dates);
  return withCleaningDates(updated, dates);
}

export async function deleteCleaning({ householdId, id }) {
  const cleaning = await homeRepository.findCleaningById(id, householdId);
  if (!cleaning) {
    throw notFound('Cleaning schedule not found.');
  }
  await taskRepository.deleteTasksBySource(householdId, 'CLEANING', id);
  await homeRepository.deleteCleaning(id);
  return { deleted: true, id };
}

// ---- Laundry ----

export async function listLaundry({ householdId, query }) {
  const [items, total] = await Promise.all([
    homeRepository.listLaundry(householdId, query),
    homeRepository.countLaundry(householdId, query),
  ]);
  return { items: items.map(toLaundryView), ...paginate(total, query.page, query.limit) };
}

export async function getLaundry({ householdId, id }) {
  const item = await homeRepository.findLaundryById(id, householdId);
  if (!item) {
    throw notFound('Laundry item not found.');
  }
  return toLaundryView(item);
}

export async function createLaundry({ user, householdId, data }) {
  const item = await homeRepository.createLaundry({
    householdId,
    createdById: user.id,
    category: data.category,
    scheduledDate: data.scheduledDate,
    notes: data.notes,
  });
  return toLaundryView(item);
}

export async function updateLaundry({ householdId, id, patch }) {
  const current = await homeRepository.findLaundryById(id, householdId);
  if (!current) {
    throw notFound('Laundry item not found.');
  }
  const updated = await homeRepository.updateLaundry(id, patch);
  return toLaundryView(updated);
}

export async function deleteLaundry({ householdId, id }) {
  const current = await homeRepository.findLaundryById(id, householdId);
  if (!current) {
    throw notFound('Laundry item not found.');
  }
  await homeRepository.deleteLaundry(id);
  return { deleted: true, id };
}

// ---- Maintenance ----

async function assertMaintenanceTransaction(transactionId, householdId, excludeMaintenanceId) {
  if (transactionId === null || transactionId === undefined) {
    return null;
  }
  const transaction = await financeRepository.findTransactionById(transactionId, householdId);
  if (!transaction || transaction.type !== 'EXPENSE') {
    throwValidationError([
      fieldError('transactionId', 'Link an expense transaction from this household.'),
    ]);
  }
  const holder = await homeRepository.findMaintenanceByTransactionId(
    transactionId,
    householdId,
    excludeMaintenanceId,
  );
  if (holder) {
    throwValidationError([
      fieldError('transactionId', 'This transaction is already linked to another job.'),
    ]);
  }
  return transactionId;
}

export async function listMaintenance({ householdId, query }) {
  const [items, total] = await Promise.all([
    homeRepository.listMaintenance(householdId, query),
    homeRepository.countMaintenance(householdId, query),
  ]);
  return { items: items.map(toMaintenanceView), ...paginate(total, query.page, query.limit) };
}

export async function getMaintenance({ householdId, id }) {
  const maintenance = await homeRepository.findMaintenanceById(id, householdId);
  if (!maintenance) {
    throw notFound('Maintenance job not found.');
  }
  return toMaintenanceView(maintenance);
}

export async function createMaintenance({ user, householdId, data }) {
  const roomId = await assertRoom(data.roomId, householdId);
  const transactionId = await assertMaintenanceTransaction(data.transactionId, householdId);
  const maintenance = await homeRepository.createMaintenance({
    householdId,
    createdById: user.id,
    roomId,
    title: data.title,
    category: data.category,
    priority: data.priority,
    status: data.status,
    scheduledDate: data.scheduledDate,
    description: data.description,
    transactionId,
    notes: data.notes,
  });
  return toMaintenanceView(maintenance);
}

export async function updateMaintenance({ householdId, id, patch }) {
  const current = await homeRepository.findMaintenanceById(id, householdId);
  if (!current) {
    throw notFound('Maintenance job not found.');
  }

  const data = { ...patch };
  if (patch.status !== undefined) {
    data.completedAt = patch.status === 'COMPLETED' ? new Date() : null;
  }
  if (patch.roomId !== undefined) {
    data.roomId = await assertRoom(patch.roomId, householdId);
  }
  if (patch.transactionId !== undefined) {
    data.transactionId = await assertMaintenanceTransaction(
      patch.transactionId,
      householdId,
      id,
    );
  }

  const updated = await homeRepository.updateMaintenance(id, data);
  return toMaintenanceView(updated);
}

export async function deleteMaintenance({ householdId, id }) {
  const current = await homeRepository.findMaintenanceById(id, householdId);
  if (!current) {
    throw notFound('Maintenance job not found.');
  }
  await homeRepository.deleteMaintenance(id);
  return { deleted: true, id };
}

export async function generateMaintenanceTask({ user, householdId, id }) {
  const maintenance = await homeRepository.findMaintenanceById(id, householdId);
  if (!maintenance) {
    throw notFound('Maintenance job not found.');
  }
  const existing = await taskRepository.findTaskBySource(householdId, 'MAINTENANCE', id);
  if (existing) {
    throw conflict('This job already has a task. Delete the task to regenerate it.', 'id');
  }
  const task = await taskService.createTask({
    user,
    householdId,
    data: {
      title: maintenance.title,
      description: maintenance.description,
      priority: maintenance.priority,
      dueDate: isoDate(maintenance.scheduledDate),
    },
    source: { type: 'MAINTENANCE', id: maintenance.id },
  });
  return task;
}