import { prisma } from '../utils/prisma.js';

const ROOM_SELECT = {
  id: true,
  name: true,
  description: true,
  active: true,
  createdAt: true,
  updatedAt: true,
};

const CLEANING_INCLUDE = {
  room: { select: { id: true, name: true } },
  assignedFamilyMember: { select: { id: true, name: true } },
};

const LAUNDRY_SELECT = {
  id: true,
  category: true,
  status: true,
  scheduledDate: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
};

const MAINTENANCE_INCLUDE = {
  room: { select: { id: true, name: true } },
};

// ---- Rooms ----

export function listRooms(householdId, { search, active, page, limit }) {
  const where = {
    householdId,
    ...(search ? { normalized: { contains: search.toLowerCase() } } : {}),
    ...(active === undefined ? {} : { active }),
  };
  return prisma.room.findMany({
    where,
    select: {
      ...ROOM_SELECT,
      _count: { select: { cleaning: true, maintenance: true } },
    },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function countRooms(householdId, { search, active }) {
  return prisma.room.count({
    where: {
      householdId,
      ...(search ? { normalized: { contains: search.toLowerCase() } } : {}),
      ...(active === undefined ? {} : { active }),
    },
  });
}

export function findRoomById(id, householdId) {
  return prisma.room.findFirst({
    where: { id, householdId },
    include: {
      cleaning: { select: { id: true } },
      maintenance: { select: { id: true } },
    },
  });
}

export function createRoom({ householdId, createdById, name, normalized, description }) {
  return prisma.room.create({
    data: { householdId, createdById, name, normalized, description },
    select: ROOM_SELECT,
  });
}

export function updateRoom(id, data) {
  return prisma.room.update({
    where: { id },
    data,
    select: ROOM_SELECT,
  });
}

export function deleteRoom(id) {
  return prisma.room.delete({ where: { id } });
}

export function countCleaningByRoomId(roomId) {
  return prisma.cleaningDefinition.count({ where: { roomId } });
}

// ---- Cleaning definitions ----

export function listCleaning(householdId, { status, roomId, page, limit }) {
  return prisma.cleaningDefinition.findMany({
    where: {
      householdId,
      ...(status ? { status } : {}),
      ...(roomId ? { roomId } : {}),
    },
    include: CLEANING_INCLUDE,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function countCleaning(householdId, { status, roomId }) {
  return prisma.cleaningDefinition.count({
    where: {
      householdId,
      ...(status ? { status } : {}),
      ...(roomId ? { roomId } : {}),
    },
  });
}

export function findCleaningById(id, householdId) {
  return prisma.cleaningDefinition.findFirst({
    where: { id, householdId },
    include: CLEANING_INCLUDE,
  });
}

export function createCleaning({ householdId, createdById, roomId, title, frequency, interval, status, assignedFamilyMemberId, notes }) {
  return prisma.cleaningDefinition.create({
    data: {
      householdId,
      createdById,
      roomId,
      title,
      frequency,
      interval,
      status,
      assignedFamilyMemberId,
      notes,
    },
    include: CLEANING_INCLUDE,
  });
}

export function updateCleaning(id, data) {
  return prisma.cleaningDefinition.update({
    where: { id },
    data,
    include: CLEANING_INCLUDE,
  });
}

export function deleteCleaning(id) {
  return prisma.cleaningDefinition.delete({ where: { id } });
}

export function updateCleaningDates(id, { nextDueAt, lastCompletedAt }) {
  return prisma.cleaningDefinition.update({
    where: { id },
    data: {
      ...(nextDueAt === undefined ? {} : { nextDueAt }),
      ...(lastCompletedAt === undefined ? {} : { lastCompletedAt }),
    },
  });
}

export function countCleaningDue(householdId, asOfDate) {
  return prisma.cleaningDefinition.count({
    where: {
      householdId,
      status: 'ACTIVE',
      nextDueAt: { lte: asOfDate },
    },
  });
}

// ---- Laundry ----

export function listLaundry(householdId, { status, category, page, limit }) {
  return prisma.laundryItem.findMany({
    where: {
      householdId,
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
    },
    select: LAUNDRY_SELECT,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function countLaundry(householdId, { status, category }) {
  return prisma.laundryItem.count({
    where: {
      householdId,
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
    },
  });
}

export function findLaundryById(id, householdId) {
  return prisma.laundryItem.findFirst({
    where: { id, householdId },
    select: LAUNDRY_SELECT,
  });
}

export function createLaundry({ householdId, createdById, category, scheduledDate, notes }) {
  return prisma.laundryItem.create({
    data: { householdId, createdById, category, scheduledDate, notes },
    select: LAUNDRY_SELECT,
  });
}

export function updateLaundry(id, data) {
  return prisma.laundryItem.update({
    where: { id },
    data,
    select: LAUNDRY_SELECT,
  });
}

export function deleteLaundry(id) {
  return prisma.laundryItem.delete({ where: { id } });
}

// ---- Maintenance ----

export function listMaintenance(householdId, { status, roomId, page, limit }) {
  return prisma.maintenance.findMany({
    where: {
      householdId,
      ...(status ? { status } : {}),
      ...(roomId ? { roomId } : {}),
    },
    include: MAINTENANCE_INCLUDE,
    orderBy: [{ status: 'asc' }, { scheduledDate: 'asc' }],
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function countMaintenance(householdId, { status, roomId }) {
  return prisma.maintenance.count({
    where: {
      householdId,
      ...(status ? { status } : {}),
      ...(roomId ? { roomId } : {}),
    },
  });
}

export function findMaintenanceById(id, householdId) {
  return prisma.maintenance.findFirst({
    where: { id, householdId },
    include: MAINTENANCE_INCLUDE,
  });
}

export function findMaintenanceByTransactionId(transactionId, householdId, excludeId) {
  return prisma.maintenance.findFirst({
    where: { transactionId, householdId, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true },
  });
}

export function createMaintenance(data) {
  return prisma.maintenance.create({ data, include: MAINTENANCE_INCLUDE });
}

export function updateMaintenance(id, data) {
  return prisma.maintenance.update({
    where: { id },
    data,
    include: MAINTENANCE_INCLUDE,
  });
}

export function deleteMaintenance(id) {
  return prisma.maintenance.delete({ where: { id } });
}

export function countMaintenanceOverdue(householdId, asOfDate) {
  return prisma.maintenance.count({
    where: {
      householdId,
      status: { in: ['OPEN', 'IN_PROGRESS'] },
      scheduledDate: { lt: asOfDate },
    },
  });
}

export function listMaintenanceInRange(householdId, { from, to }) {
  return prisma.maintenance.findMany({
    where: {
      householdId,
      status: { not: 'CANCELLED' },
      scheduledDate: { gte: from, lte: to },
    },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      status: true,
      scheduledDate: true,
      createdAt: true,
      updatedAt: true,
      room: { select: { id: true, name: true } },
    },
    orderBy: { scheduledDate: 'asc' },
  });
}

export async function exportHomeData(householdId) {
  const [rooms, cleaning, laundry, maintenance] = await Promise.all([
    prisma.room.findMany({
      where: { householdId },
      select: { id: true, name: true, description: true, active: true, createdAt: true, updatedAt: true },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    }),
    prisma.cleaningDefinition.findMany({
      where: { householdId },
      include: { room: { select: { id: true, name: true } }, assignedFamilyMember: { select: { id: true, name: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.laundryItem.findMany({
      where: { householdId },
      select: { id: true, category: true, status: true, scheduledDate: true, notes: true, createdAt: true, updatedAt: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.maintenance.findMany({
      where: { householdId },
      include: { room: { select: { id: true, name: true } } },
      orderBy: [{ status: 'asc' }, { scheduledDate: 'asc' }],
    }),
  ]);

  return { rooms, cleaning, laundry, maintenance };
}