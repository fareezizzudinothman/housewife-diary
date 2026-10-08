import { prisma } from '../utils/prisma.js';

const LIST_INCLUDE = {
  _count: { select: { ingredients: true } },
};

const DETAIL_INCLUDE = {
  ingredients: { orderBy: { sortOrder: 'asc' } },
  createdBy: { select: { id: true, name: true } },
};

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function buildRecipeWhere(householdId, query = {}) {
  const where = { householdId };
  if (query.search) {
    const contains = escapeLike(query.search);
    where.OR = [
      { title: { contains, mode: 'insensitive' } },
      { description: { contains, mode: 'insensitive' } },
    ];
  }
  if (query.category) {
    where.category = { equals: query.category, mode: 'insensitive' };
  }
  if (query.favourite !== undefined) {
    where.isFavourite = query.favourite;
  }
  return where;
}

function recipeOrder(query) {
  if (query.sort === 'title') {
    return [{ title: 'asc' }];
  }
  if (query.sort === 'created') {
    return [{ createdAt: 'desc' }];
  }
  return [{ updatedAt: 'desc' }];
}

export function countRecipes(where) {
  return prisma.recipe.count({ where });
}

export function listRecipes(where, query) {
  return prisma.recipe.findMany({
    where,
    include: LIST_INCLUDE,
    orderBy: recipeOrder(query),
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
}

export function findRecipeById(id, householdId) {
  return prisma.recipe.findFirst({
    where: { id, householdId },
    include: DETAIL_INCLUDE,
  });
}

export function createRecipe(householdId, createdById, data, ingredients) {
  return prisma.recipe.create({
    data: {
      ...data,
      householdId,
      createdById,
      ingredients: { create: ingredients },
    },
    include: DETAIL_INCLUDE,
  });
}

// Replaces the ingredient list inside a transaction; ownership is re-checked
// so a cross-household id never mutates rows.
export function updateRecipe(id, householdId, data, ingredients) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.recipe.findFirst({ where: { id, householdId }, select: { id: true } });
    if (!owned) {
      return null;
    }
    if (ingredients !== undefined) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
    }
    return tx.recipe.update({
      where: { id, householdId },
      data: {
        ...data,
        ...(ingredients !== undefined && ingredients.length
          ? { ingredients: { create: ingredients } }
          : {}),
      },
      include: DETAIL_INCLUDE,
    });
  });
}

export function deleteRecipe(id, householdId) {
  return prisma.recipe.delete({ where: { id, householdId } });
}

export function listRecipeCategories(householdId) {
  return prisma.recipe.findMany({
    where: { householdId, category: { not: null } },
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  });
}

export function countRecipesForHousehold(householdId) {
  return prisma.recipe.count({ where: { householdId } });
}

export function listFavouriteRecipes(householdId, limit) {
  return prisma.recipe.findMany({
    where: { householdId, isFavourite: true },
    include: LIST_INCLUDE,
    orderBy: { title: 'asc' },
    take: limit,
  });
}
