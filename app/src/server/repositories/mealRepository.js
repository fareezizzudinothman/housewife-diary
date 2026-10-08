import { prisma } from '../utils/prisma.js';

const ENTRY_INCLUDE = {
  recipe: { select: { id: true, title: true, servings: true } },
};

// Ingredients travel with meal entries only for the shopping-plan preview.
const SHOPPING_INCLUDE = {
  recipe: {
    include: { ingredients: { orderBy: { sortOrder: 'asc' } } },
  },
};

export function listRange(householdId, from, to, mealType) {
  return prisma.mealPlanEntry.findMany({
    where: {
      householdId,
      date: { gte: from, lte: to },
      ...(mealType ? { mealType } : {}),
    },
    include: ENTRY_INCLUDE,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });
}

export function listRangeWithRecipes(householdId, from, to) {
  return prisma.mealPlanEntry.findMany({
    where: { householdId, date: { gte: from, lte: to }, recipeId: { not: null } },
    include: SHOPPING_INCLUDE,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });
}

export function listForDate(householdId, date) {
  return prisma.mealPlanEntry.findMany({
    where: { householdId, date },
    include: ENTRY_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
}

export function findEntryById(id, householdId) {
  return prisma.mealPlanEntry.findFirst({
    where: { id, householdId },
    include: ENTRY_INCLUDE,
  });
}

export function createEntry(data) {
  return prisma.mealPlanEntry.create({ data, include: ENTRY_INCLUDE });
}

export function updateEntry(id, householdId, data) {
  return prisma.mealPlanEntry.update({
    where: { id, householdId },
    data,
    include: ENTRY_INCLUDE,
  });
}

export function deleteEntry(id, householdId) {
  return prisma.mealPlanEntry.delete({ where: { id, householdId } });
}

export function countBetween(householdId, from, to) {
  return prisma.mealPlanEntry.count({ where: { householdId, date: { gte: from, lte: to } } });
}

// Called when a recipe is deleted: entries that only referenced the recipe
// keep its name as a free-text title instead of becoming empty rows.
export function snapshotRecipeTitles(householdId, recipeId, title) {
  return prisma.mealPlanEntry.updateMany({
    where: { householdId, recipeId, title: null },
    data: { title },
  });
}
