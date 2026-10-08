import { prisma } from '../utils/prisma.js';

const ENTRY_INCLUDE = {
  mood: { select: { id: true, name: true } },
  tags: {
    include: { tag: { select: { id: true, name: true, normalized: true } } },
    orderBy: { tag: { name: 'asc' } },
  },
  _count: { select: { attachments: true } },
};

const ATTACHMENT_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
};

// Diary entries are always scoped to BOTH household and user so a member
// can only ever touch their own entries inside the active household.
function ownerScope({ householdId, userId }) {
  return { householdId, userId };
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function listMoods() {
  return prisma.mood.findMany({ orderBy: { sortOrder: 'asc' } });
}

export function findMoodById(id) {
  return prisma.mood.findUnique({ where: { id } });
}

export function listUserTags({ householdId, userId }) {
  return prisma.diaryTag.findMany({
    where: { ...ownerScope({ householdId, userId }) },
    orderBy: { name: 'asc' },
  });
}

export function buildEntryWhere(scope, query = {}) {
  const where = { ...scope };

  if (query.search) {
    const contains = escapeLike(query.search);
    where.OR = [
      { title: { contains, mode: 'insensitive' } },
      { content: { contains, mode: 'insensitive' } },
    ];
  }

  if (query.from || query.to) {
    where.entryDate = {};
    if (query.from) {
      where.entryDate.gte = query.from;
    }
    if (query.to) {
      where.entryDate.lte = query.to;
    }
  }

  if (query.mood) {
    where.moodId = query.mood;
  }

  if (query.tag) {
    where.tags = { some: { tag: { normalized: query.tag.toLowerCase() } } };
  }

  return where;
}

export function countEntries(scope, query = {}) {
  return prisma.diaryEntry.count({ where: buildEntryWhere(scope, query) });
}

export function listEntries(scope, query = {}) {
  const where = buildEntryWhere(scope, query);
  const page = query.page || 1;
  const limit = query.limit || 20;
  return prisma.diaryEntry.findMany({
    where,
    include: ENTRY_INCLUDE,
    // Newest day first; within a day morning -> evening; ties by creation.
    orderBy: [{ entryDate: 'desc' }, { timeOfDay: 'asc' }, { createdAt: 'asc' }],
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function findEntryById(id, scope) {
  return prisma.diaryEntry.findFirst({
    where: { id, ...scope },
    include: ENTRY_INCLUDE,
  });
}

export function createEntry(scope, { title, content, entryDate, timeOfDay, moodId, tags }) {
  return prisma.diaryEntry.create({
    data: {
      ...scope,
      title,
      content,
      entryDate,
      timeOfDay,
      moodId,
      tags: tags?.length
        ? {
            create: tags.map((tagId) => ({ tagId })),
          }
        : undefined,
    },
    include: ENTRY_INCLUDE,
  });
}

export function updateEntry(id, scope, { title, content, entryDate, timeOfDay, moodId, tags }) {
  return prisma.$transaction(async (tx) => {
    // Re-check ownership inside the transaction so tag rows are never
    // rewritten for an entry the caller does not own.
    const owned = await tx.diaryEntry.findFirst({
      where: { id, ...scope },
      select: { id: true },
    });
    if (!owned) {
      return null;
    }
    if (tags) {
      await tx.diaryEntryTag.deleteMany({ where: { entryId: id } });
      if (tags.length) {
        await tx.diaryEntryTag.createMany({
          data: tags.map((tagId) => ({ entryId: id, tagId })),
        });
      }
    }
    return tx.diaryEntry.update({
      where: { id, ...scope },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(entryDate !== undefined ? { entryDate } : {}),
        ...(timeOfDay !== undefined ? { timeOfDay } : {}),
        ...(moodId !== undefined ? { moodId } : {}),
      },
      include: ENTRY_INCLUDE,
    });
  });
}

export function deleteEntry(id, scope) {
  return prisma.diaryEntry.delete({ where: { id, ...scope } });
}

// Finds or creates the personal tag (unique per household + user + name).
export function resolveTag({ householdId, userId, name, normalized }) {
  return prisma.diaryTag.upsert({
    where: {
      householdId_userId_normalized: { householdId, userId, normalized },
    },
    create: { householdId, userId, name, normalized },
    update: {},
  });
}

export function listAttachments(entryId) {
  return prisma.diaryAttachment.findMany({
    where: { entryId },
    select: { ...ATTACHMENT_SELECT, storedName: true },
    orderBy: { createdAt: 'asc' },
  });
}

export function findAttachment(id, entryId) {
  return prisma.diaryAttachment.findFirst({
    where: { id, entryId },
    select: { ...ATTACHMENT_SELECT, storedName: true, mimeType: true },
  });
}

export function countAttachments(entryId) {
  return prisma.diaryAttachment.count({ where: { entryId } });
}

export function createAttachment(entryId, { originalName, storedName, mimeType, sizeBytes }) {
  return prisma.diaryAttachment.create({
    data: { entryId, originalName, storedName, mimeType, sizeBytes },
    select: { ...ATTACHMENT_SELECT },
  });
}

export function deleteAttachment(id, entryId) {
  return prisma.diaryAttachment.delete({ where: { id, entryId } });
}

export function listEntriesForExport({ householdId, userId }) {
  return prisma.diaryEntry.findMany({
    where: { householdId, userId },
    include: {
      mood: { select: { id: true, name: true } },
      tags: { include: { tag: { select: { id: true, name: true, normalized: true } } }, orderBy: { tag: { name: 'asc' } } },
      _count: { select: { attachments: true } },
    },
    orderBy: [{ entryDate: 'desc' }, { timeOfDay: 'asc' }, { createdAt: 'asc' }],
  });
}
