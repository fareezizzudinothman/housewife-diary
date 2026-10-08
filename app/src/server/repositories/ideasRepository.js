import { prisma } from '../utils/prisma.js';

const IDEA_SELECT = {
  id: true,
  title: true,
  description: true,
  category: true,
  priority: true,
  status: true,
  estimatedCost: true,
  currency: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
};

function ideaWhere(householdId, query) {
  const where = { householdId };
  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.category) {
    where.category = query.category;
  }
  if (query.status) {
    where.status = query.status;
  }
  return where;
}

export function listIdeas(householdId, query) {
  return prisma.idea.findMany({
    where: ideaWhere(householdId, query),
    select: IDEA_SELECT,
    orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
}

export function countIdeas(householdId, query) {
  return prisma.idea.count({ where: ideaWhere(householdId, query) });
}

export function findIdeaById(id, householdId) {
  return prisma.idea.findFirst({
    where: { id, householdId },
    select: IDEA_SELECT,
  });
}

export function createIdea({ householdId, createdById }, data) {
  return prisma.idea.create({
    data: {
      householdId,
      createdById,
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      status: data.status,
      estimatedCost: data.estimatedCost,
      currency: data.currency,
      notes: data.notes,
    },
    select: IDEA_SELECT,
  });
}

export function updateIdea(id, householdId, data) {
  return prisma.idea.update({
    where: { id },
    data,
    select: IDEA_SELECT,
  });
}

export function deleteIdea(id, householdId) {
  return prisma.idea.deleteMany({ where: { id, householdId } });
}