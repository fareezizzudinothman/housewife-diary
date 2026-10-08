import { AppError, ErrorCodes } from '../../shared/errors.js';
import * as shoppingRepository from '../repositories/shoppingRepository.js';
import * as recipeRepository from '../repositories/recipeRepository.js';
import * as mealRepository from '../repositories/mealRepository.js';
import * as inventoryService from './inventoryService.js';
import { decimalToNumber } from '../utils/decimal.js';

function notFound(message = 'Shopping list not found.') {
  return new AppError(message, {
    code: ErrorCodes.NOT_FOUND,
    status: 404,
  });
}

function itemNotFound() {
  return new AppError('Shopping item not found.', {
    code: ErrorCodes.NOT_FOUND,
    status: 404,
  });
}

function mergeQuantities(first, second) {
  const a = decimalToNumber(first);
  const b = decimalToNumber(second);
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return Math.round((a + b) * 1000) / 1000;
}

function toItemView(item) {
  return {
    id: item.id,
    name: item.name,
    quantity: decimalToNumber(item.quantity),
    unit: item.unit,
    category: item.category,
    notes: item.notes,
    purchased: Boolean(item.purchasedAt),
    purchasedAt: item.purchasedAt ? item.purchasedAt.toISOString() : null,
    recipe: item.recipe ? { id: item.recipe.id, title: item.recipe.title } : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toListView(list, remaining) {
  return {
    id: list.id,
    name: list.name,
    notes: list.notes,
    archived: Boolean(list.archivedAt),
    archivedAt: list.archivedAt ? list.archivedAt.toISOString() : null,
    itemCount: list._count?.items ?? 0,
    remaining,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
}

async function remainingForList(listId) {
  return shoppingRepository.countRemainingInList(listId);
}

async function assertList(listId, householdId) {
  const list = await shoppingRepository.findListById(listId, householdId);
  if (!list) {
    throw notFound();
  }
  return list;
}

async function listView(listId, householdId) {
  const list = await shoppingRepository.findListById(listId, householdId);
  if (!list) {
    throw notFound();
  }
  return toListView(list, await remainingForList(listId));
}

// Merge rule (documented in docs/shopping.md): match unpurchased rows by
// normalized name + unit (case-insensitive); sum quantities; a different
// non-empty unit creates a separate line because units are not convertible.
async function mergeItem(listId, incoming) {
  const unitKey = (incoming.unit ?? '').toLowerCase();
  const candidates = await shoppingRepository.listOpenItemsByNormalized(
    listId,
    incoming.normalized,
  );
  const match = candidates.find((candidate) => (candidate.unit ?? '').toLowerCase() === unitKey);
  if (match) {
    const data = {
      quantity: mergeQuantities(match.quantity, incoming.quantity),
      recipeId: match.recipeId ?? incoming.recipeId ?? null,
    };
    if (!match.unit && incoming.unit) {
      data.unit = incoming.unit;
    }
    if (match.category === 'OTHER' && incoming.category && incoming.category !== 'OTHER') {
      data.category = incoming.category;
    }
    const item = await shoppingRepository.updateItem(match.id, listId, data);
    return { item, merged: true };
  }
  const item = await shoppingRepository.createItem({
    listId,
    name: incoming.name,
    normalized: incoming.normalized,
    quantity: incoming.quantity ?? null,
    unit: incoming.unit ?? null,
    category: incoming.category ?? 'OTHER',
    recipeId: incoming.recipeId ?? null,
  });
  return { item, merged: false };
}

// ---- Lists ----

export async function listLists({ householdId, query }) {
  const where = shoppingRepository.buildListWhere(householdId, query);
  const [total, lists] = await Promise.all([
    shoppingRepository.countLists(where),
    shoppingRepository.listLists(where, query),
  ]);
  const counts = await shoppingRepository.countRemainingByListIds(lists.map((list) => list.id));
  const remainingById = new Map(counts.map((row) => [row.listId, row._count.listId]));
  return {
    items: lists.map((list) => toListView(list, remainingById.get(list.id) ?? 0)),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getList({ householdId, id }) {
  const list = await shoppingRepository.findListById(id, householdId);
  if (!list) {
    throw notFound();
  }
  return toListView(list, await remainingForList(id));
}

export async function createList({ user, householdId, data }) {
  const list = await shoppingRepository.createList({
    householdId,
    createdById: user.id,
    name: data.name,
    notes: data.notes,
  });
  return toListView(list, 0);
}

export async function updateList({ householdId, id, patch }) {
  const list = await shoppingRepository.findListById(id, householdId);
  if (!list) {
    throw notFound();
  }
  const data = {};
  if (patch.name !== undefined) {
    data.name = patch.name;
  }
  if (patch.notes !== undefined) {
    data.notes = patch.notes;
  }
  if (patch.archived !== undefined) {
    data.archivedAt = patch.archived ? new Date() : null;
  }
  const updated = await shoppingRepository.updateList(id, householdId, data);
  return toListView(updated, await remainingForList(id));
}

export async function deleteList({ householdId, id }) {
  const list = await shoppingRepository.findListById(id, householdId);
  if (!list) {
    throw notFound();
  }
  await shoppingRepository.deleteList(id, householdId);
  return { id, deleted: true };
}

// ---- Items ----

export async function listItems({ householdId, listId, query }) {
  await assertList(listId, householdId);
  const where = shoppingRepository.buildItemWhere(listId, query);
  const [total, items] = await Promise.all([
    shoppingRepository.countItems(where),
    shoppingRepository.listItems(where, query),
  ]);
  return {
    items: items.map(toItemView),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
    list: await listView(listId, householdId),
  };
}

export async function createItem({ householdId, listId, data }) {
  await assertList(listId, householdId);
  const item = await shoppingRepository.createItem({ ...data, listId });
  await shoppingRepository.touchList(listId);
  return toItemView(item);
}

export async function updateItem({ householdId, listId, itemId, patch }) {
  await assertList(listId, householdId);
  const existing = await shoppingRepository.findItemById(itemId, listId);
  if (!existing) {
    throw itemNotFound();
  }
  const data = {};
  if (patch.name !== undefined) {
    data.name = patch.name;
    data.normalized = patch.normalized;
  }
  if (patch.quantity !== undefined) {
    data.quantity = patch.quantity;
  }
  if (patch.unit !== undefined) {
    data.unit = patch.unit;
  }
  if (patch.category !== undefined) {
    data.category = patch.category;
  }
  if (patch.notes !== undefined) {
    data.notes = patch.notes;
  }
  if (patch.purchased !== undefined) {
    data.purchasedAt = patch.purchased ? new Date() : null;
  }
  const item = await shoppingRepository.updateItem(itemId, listId, data);
  await shoppingRepository.touchList(listId);
  return toItemView(item);
}

export async function deleteItem({ householdId, listId, itemId }) {
  await assertList(listId, householdId);
  const existing = await shoppingRepository.findItemById(itemId, listId);
  if (!existing) {
    throw itemNotFound();
  }
  await shoppingRepository.deleteItem(itemId, listId);
  await shoppingRepository.touchList(listId);
  return { id: itemId, deleted: true };
}

// ---- Recipe -> shopping ----

export async function addFromRecipe({ householdId, listId, recipeId, servings }) {
  await assertList(listId, householdId);
  const recipe = await recipeRepository.findRecipeById(recipeId, householdId);
  if (!recipe) {
    throw notFound('Recipe not found.');
  }

  // Scale ingredient quantities from the recipe's own serving count.
  const factor =
    servings && recipe.servings && recipe.servings > 0 ? servings / recipe.servings : 1;

  const results = [];
  for (const ingredient of recipe.ingredients) {
    const base = decimalToNumber(ingredient.quantity);
    const quantity = base === null ? null : Math.round(base * factor * 1000) / 1000;
    results.push(
      await mergeItem(listId, {
        name: ingredient.name,
        normalized: ingredient.normalized,
        quantity,
        unit: ingredient.unit,
        category: 'OTHER',
        recipeId: recipe.id,
      }),
    );
  }
  await shoppingRepository.touchList(listId);

  return {
    list: await listView(listId, householdId),
    added: results.filter((result) => !result.merged).length,
    merged: results.filter((result) => result.merged).length,
    items: results.map((result) => toItemView(result.item)),
  };
}

// ---- Meal plan -> shopping ----

// Aggregates recipe ingredients across planned meals in the range; identical
// (normalized name + unit) lines are summed and each source meal is recorded.
async function aggregateMealIngredients(householdId, from, to) {
  const entries = await mealRepository.listRangeWithRecipes(householdId, from, to);
  const aggregates = new Map();
  for (const entry of entries) {
    for (const ingredient of entry.recipe.ingredients) {
      const unitKey = (ingredient.unit ?? '').toLowerCase();
      const key = `${ingredient.normalized}|${unitKey}`;
      let aggregate = aggregates.get(key);
      if (!aggregate) {
        aggregate = {
          name: ingredient.name,
          normalized: ingredient.normalized,
          unit: ingredient.unit,
          quantity: null,
          sources: [],
        };
        aggregates.set(key, aggregate);
      }
      aggregate.quantity = mergeQuantities(aggregate.quantity, ingredient.quantity);
      aggregate.sources.push({
        mealId: entry.id,
        date: entry.date.toISOString().slice(0, 10),
        mealType: entry.mealType,
        recipe: entry.recipe.title,
      });
    }
  }
  return [...aggregates.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function previewFromMeals({ householdId, query }) {
  const aggregates = await aggregateMealIngredients(householdId, query.from, query.to);
  return {
    from: query.from.toISOString().slice(0, 10),
    to: query.to.toISOString().slice(0, 10),
    items: aggregates.map((aggregate) => ({
      name: aggregate.name,
      quantity: aggregate.quantity,
      unit: aggregate.unit,
      category: 'OTHER',
      sources: aggregate.sources,
    })),
  };
}

// ---- Shopping -> inventory ----

// Explicit user action: a purchased line (or any line the user chooses) is
// pushed into inventory, merged by normalized name + unit, recorded as a
// PURCHASE transaction, and marked purchased on the list.
export async function addItemToInventory({ user, householdId, listId, itemId, data }) {
  await assertList(listId, householdId);
  const shoppingItem = await shoppingRepository.findItemById(itemId, listId);
  if (!shoppingItem) {
    throw itemNotFound();
  }

  const result = await inventoryService.addFromShopping({
    user,
    householdId,
    incoming: {
      name: shoppingItem.name,
      normalized: shoppingItem.normalized,
      quantity: data.quantity ?? decimalToNumber(shoppingItem.quantity) ?? 1,
      unit: shoppingItem.unit,
      category: data.category ?? shoppingItem.category,
      location: data.location,
      expiresAt: data.expiresAt,
      note: data.note,
    },
  });

  const updatedItem = await shoppingRepository.updateItem(itemId, listId, {
    purchasedAt: shoppingItem.purchasedAt ?? new Date(),
  });
  await shoppingRepository.touchList(listId);

  return {
    item: toItemView(updatedItem),
    inventoryItem: result.item,
    merged: result.merged,
  };
}

// The caller reviews the preview and commits an explicit item list (or, when
// omitted, the live aggregation).
export async function addFromMeals({ householdId, listId, from, to, items }) {
  await assertList(listId, householdId);
  const committed = items ?? (await aggregateMealIngredients(householdId, from, to));

  const results = [];
  for (const entry of committed) {
    results.push(
      await mergeItem(listId, {
        name: entry.name,
        normalized: entry.normalized ?? entry.name.toLowerCase(),
        quantity: entry.quantity,
        unit: entry.unit,
        category: entry.category ?? 'OTHER',
        recipeId: null,
      }),
    );
  }
  await shoppingRepository.touchList(listId);

  return {
    list: await listView(listId, householdId),
    added: results.filter((result) => !result.merged).length,
    merged: results.filter((result) => result.merged).length,
  };
}

export { toItemView, listView };
