import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';

const EVENT_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
};

// Non-recurring events that overlap [from, to] plus every recurring head that
// starts at or before `to` (each is expanded in memory by the service).
export function listEventsForRange(householdId, { from, to }) {
  return prisma.calendarEvent.findMany({
    where: {
      householdId,
      OR: [
        {
          recurrence: { equals: Prisma.DbNull },
          startAt: { lte: to },
          // Half-open: an event ending exactly when the range starts belongs
          // to the previous day only.
          endAt: { gt: from },
        },
        {
          recurrence: { not: Prisma.DbNull },
          startAt: { lte: to },
        },
      ],
    },
    include: EVENT_INCLUDE,
    orderBy: { startAt: 'asc' },
  });
}

export function findEventById(id, householdId) {
  return prisma.calendarEvent.findFirst({
    where: { id, householdId },
    include: EVENT_INCLUDE,
  });
}

// Nullable Json columns need an explicit database-NULL marker in Prisma.
function normalizeJson(data) {
  if (!('recurrence' in data)) {
    return data;
  }
  const { recurrence, ...rest } = data;
  return { ...rest, recurrence: recurrence ?? Prisma.DbNull };
}

export function createEvent(data) {
  return prisma.calendarEvent.create({ data: normalizeJson(data), include: EVENT_INCLUDE });
}

export function updateEvent(id, householdId, data) {
  return prisma.calendarEvent.update({
    where: { id, householdId },
    data: normalizeJson(data),
    include: EVENT_INCLUDE,
  });
}

export function deleteEvent(id, householdId) {
  return prisma.calendarEvent.delete({ where: { id, householdId } });
}

export function countEventsStartingBetween(householdId, from, to) {
  return prisma.calendarEvent.count({
    where: { householdId, startAt: { gte: from, lte: to } },
  });
}

export function listUpcomingEvents(householdId, from, to, limit) {
  return prisma.calendarEvent.findMany({
    where: { householdId, startAt: { gte: from, lte: to } },
    include: EVENT_INCLUDE,
    orderBy: { startAt: 'asc' },
    take: limit,
  });
}

export function listEventsForExport(householdId) {
  return prisma.calendarEvent.findMany({
    where: { householdId },
    include: EVENT_INCLUDE,
    orderBy: { startAt: 'asc' },
  });
}
