import { prisma } from '../utils/prisma.js';

const NOTE_SELECT = {
  id: true,
  title: true,
  content: true,
  category: true,
  pinned: true,
  archived: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  tags: { include: { tag: { select: { id: true, name: true } } } },
};

function noteWhere(householdId, query) {
  const where = { householdId };
  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: 'insensitive' } },
      { content: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.category) {
    where.category = query.category;
  }
  if (query.pinned !== undefined) {
    where.pinned = query.pinned;
  }
  if (query.archived !== undefined) {
    where.archived = query.archived;
  }
  if (query.tag) {
    where.tags = {
      some: { tag: { normalized: query.tag.toLowerCase() } },
    };
  }
  return where;
}

export function listNotes(householdId, query) {
  return prisma.note.findMany({
    where: noteWhere(householdId, query),
    select: NOTE_SELECT,
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
}

export function countNotes(householdId, query) {
  return prisma.note.count({ where: noteWhere(householdId, query) });
}

export function findNoteById(id, householdId) {
  return prisma.note.findFirst({
    where: { id, householdId },
    select: NOTE_SELECT,
  });
}

export function createNote({ householdId, createdById }, data) {
  return prisma.note.create({
    data: {
      householdId,
      createdById,
      title: data.title,
      content: data.content,
      category: data.category,
      pinned: data.pinned,
      archived: data.archived,
      tags: {
        create: data.tags.map((tagId) => ({ tagId })),
      },
    },
    select: NOTE_SELECT,
  });
}

export function updateNote(id, householdId, data) {
  const record = { ...data };
  if (data.tags !== undefined) {
    record.tags = {
      deleteMany: {},
      create: data.tags.map((tagId) => ({ tagId })),
    };
  }
  return prisma.note.update({
    where: { id },
    data: record,
    select: NOTE_SELECT,
  });
}

export function deleteNote(id, householdId) {
  return prisma.note.deleteMany({ where: { id, householdId } });
}

// Finds or creates the household tag vocabulary entry (unique per household +
// normalized name), reusing the stored casing from the first use.
export function resolveNoteTag({ householdId, name, normalized }) {
  return prisma.noteTag.upsert({
    where: { householdId_normalized: { householdId, normalized } },
    create: { householdId, name, normalized },
    update: {},
  });
}

export function listNoteTags(householdId) {
  return prisma.noteTag.findMany({
    where: { householdId },
    select: {
      id: true,
      name: true,
      _count: { select: { notes: true } },
    },
    orderBy: { name: 'asc' },
  });
}

export function listNotesForExport(householdId, userId) {
  return prisma.note.findMany({
    where: { householdId, createdById: userId },
    select: NOTE_SELECT,
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
  });
}