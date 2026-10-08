import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';

const TASK_INCLUDE = {
  category: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  assignedFamilyMember: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};

const CATEGORY_SELECT = {
  id: true,
  name: true,
  normalized: true,
};

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

// ---- Categories (household-wide vocabulary) ----

export function listCategories(householdId) {
  return prisma.taskCategory.findMany({
    where: { householdId },
    select: CATEGORY_SELECT,
    orderBy: { name: 'asc' },
  });
}

export function findCategoryById(id, householdId) {
  return prisma.taskCategory.findFirst({
    where: { id, householdId },
    select: CATEGORY_SELECT,
  });
}

export function createCategory({ householdId, name, normalized }) {
  return prisma.taskCategory.create({
    data: { householdId, name, normalized },
    select: CATEGORY_SELECT,
  });
}

export function deleteCategory(id, householdId) {
  return prisma.taskCategory.deleteMany({ where: { id, householdId } });
}

// ---- Tasks ----

export function buildTaskWhere(householdId, query, bounds) {
  const where = { householdId };

  // The view selects a time window + the statuses that belong to it; an
  // explicit status filter always wins.
  if (query.view === 'today') {
    where.dueAt = { gte: bounds.startOfToday, lte: bounds.endOfToday };
  } else if (query.view === 'upcoming') {
    where.dueAt = { gt: bounds.endOfToday };
  } else if (query.view === 'overdue') {
    where.dueAt = { lt: bounds.startOfToday };
  } else if (query.view === 'completed') {
    where.status = 'COMPLETED';
  }

  if (query.status) {
    where.status = query.status;
  } else if (query.view === 'today' || query.view === 'upcoming' || query.view === 'overdue') {
    where.status = { in: ['TODO', 'IN_PROGRESS'] };
  }

  if (query.priority) {
    where.priority = query.priority;
  }

  if (query.category === 'none') {
    where.categoryId = null;
  } else if (query.category) {
    where.categoryId = query.category;
  }

  if (query.assignee === 'unassigned') {
    where.assignedToId = null;
  } else if (query.assignee) {
    where.assignedToId = query.assignee;
  }

  if (query.search) {
    const contains = escapeLike(query.search);
    where.OR = [
      { title: { contains, mode: 'insensitive' } },
      { description: { contains, mode: 'insensitive' } },
    ];
  }

  return where;
}

function orderFor(query) {
  // Due dates read soonest-first by default; priority and creation read
  // newest/most-urgent first.
  const defaultDir = query.sort === 'due' ? 'asc' : 'desc';
  const dir = query.dir === 'asc' || query.dir === 'desc' ? query.dir : defaultDir;
  if (query.sort === 'priority') {
    // URGENT > HIGH > MEDIUM > LOW when descending (enum declaration order).
    return [{ priority: dir }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }];
  }
  if (query.sort === 'created') {
    return [{ createdAt: dir }];
  }
  return [{ dueAt: { sort: dir, nulls: 'last' } }, { createdAt: 'desc' }];
}

export function countTasks(where) {
  return prisma.task.count({ where });
}

export function listTasks(where, query) {
  const page = query.page || 1;
  const limit = query.limit || 20;
  return prisma.task.findMany({
    where,
    include: TASK_INCLUDE,
    orderBy: orderFor(query),
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function findTaskById(id, householdId) {
  return prisma.task.findFirst({
    where: { id, householdId },
    include: TASK_INCLUDE,
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

export function createTask(data) {
  return prisma.task.create({ data: normalizeJson(data), include: TASK_INCLUDE });
}

// Creates the series head and its first window of occurrences atomically.
export function createSeries(data, occurrenceRows) {
  return prisma.$transaction(async (tx) => {
    const head = await tx.task.create({ data: normalizeJson(data), include: TASK_INCLUDE });
    if (occurrenceRows.length) {
      await tx.task.createMany({
        data: occurrenceRows.map((row) => ({ ...normalizeJson(row), seriesId: head.id })),
      });
    }
    return head;
  });
}

export function updateTask(id, householdId, data) {
  return prisma.task.update({
    where: { id, householdId },
    data: normalizeJson(data),
    include: TASK_INCLUDE,
  });
}

export function updateOpenOccurrences(seriesId, data) {
  return prisma.task.updateMany({
    where: { seriesId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    data,
  });
}

export function countCategoryUsage(householdId) {
  return prisma.task.groupBy({
    by: ['categoryId'],
    where: { householdId, categoryId: { not: null } },
    _count: { categoryId: true },
  });
}

export function deleteTask(id, householdId) {
  return prisma.task.delete({ where: { id, householdId } });
}

// ---- Generated-task provenance (Phase 8) ----

// The head generated for a cleaning definition / maintenance / idea. The
// unique (sourceType, sourceId) constraint guarantees at most one.
export function findTaskBySource(householdId, sourceType, sourceId) {
  return prisma.task.findFirst({
    where: { householdId, sourceType, sourceId },
    include: TASK_INCLUDE,
  });
}

// Removes the generated head — occurrences cascade via the series relation.
export function deleteTasksBySource(householdId, sourceType, sourceId) {
  return prisma.task.deleteMany({ where: { householdId, sourceType, sourceId } });
}

// ---- Recurring series ----

export function listSeriesHeads(householdId) {
  return prisma.task.findMany({
    where: {
      householdId,
      recurrence: { not: Prisma.DbNull },
    },
    select: { id: true, dueAt: true, recurrence: true },
  });
}

// Materialized occurrence rows of a series (everything but the head). Used by
// the home module to derive a cleaning definition's next due / last completed.
export function listSeriesOccurrences(householdId, seriesId) {
  return prisma.task.findMany({
    where: { householdId, seriesId, NOT: { id: seriesId } },
    select: {
      id: true,
      dueAt: true,
      status: true,
      completedAt: true,
    },
    orderBy: { dueAt: 'asc' },
  });
}

export function listOccurrenceDueDates(householdId, seriesIds) {
  if (!seriesIds.length) {
    return Promise.resolve([]);
  }
  return prisma.task.findMany({
    where: { householdId, seriesId: { in: seriesIds } },
    select: { seriesId: true, dueAt: true },
    orderBy: { dueAt: 'asc' },
  });
}

export function createOccurrences(seriesId, rows) {
  if (!rows.length) {
    return Promise.resolve({ count: 0 });
  }
  return prisma.task.createMany({
    data: rows.map((row) => ({ ...normalizeJson(row), seriesId })),
  });
}

// Used when a series head changes schedule: drops the pending future rows
// (completed history stays) so they can be regenerated from the new anchor.
export function deleteOpenOccurrences(seriesId) {
  return prisma.task.deleteMany({
    where: { seriesId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
  });
}

// ---- Dashboard / calendar aggregation ----

export function countOpenTasks(householdId) {
  return prisma.task.count({
    where: { householdId, status: { in: ['TODO', 'IN_PROGRESS'] } },
  });
}

export function countTasksDueBetween(householdId, from, to) {
  return prisma.task.count({
    where: {
      householdId,
      status: { in: ['TODO', 'IN_PROGRESS'] },
      dueAt: { gte: from, lte: to },
    },
  });
}

export function listTasksDueBetween(householdId, from, to) {
  return prisma.task.findMany({
    where: {
      householdId,
      status: { not: 'CANCELLED' },
      dueAt: { gte: from, lte: to },
    },
    include: TASK_INCLUDE,
    orderBy: [{ dueAt: 'asc' }],
  });
}

export function listRecentOpenTasks(householdId, limit) {
  return prisma.task.findMany({
    where: { householdId, status: { in: ['TODO', 'IN_PROGRESS'] } },
    include: TASK_INCLUDE,
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: limit,
  });
}

export function listTasksForExport(householdId) {
  return prisma.task.findMany({
    where: { householdId },
    include: TASK_INCLUDE,
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
  });
}
