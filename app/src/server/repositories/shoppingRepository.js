import { prisma } from '../utils/prisma.js';

const LIST_INCLUDE = {
  _count: { select: { items: true } },
};

const ITEM_INCLUDE = {
  recipe: { select: { id: true, title: true } },
};

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function buildListWhere(householdId, query = {}) {
  const where = { householdId };
  // Active lists are the default; ?archived=true lists the archived ones.
  where.archivedAt = query.archived === true ? { not: null } : null;
  if (query.search) {
    where.name = { contains: escapeLike(query.search), mode: 'insensitive' };
  }
  return where;
}

export function countLists(where) {
  return prisma.shoppingList.count({ where });
}

export function listLists(where, query) {
  return prisma.shoppingList.findMany({
    where,
    include: LIST_INCLUDE,
    orderBy: [{ updatedAt: 'desc' }],
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
}

export function findListById(id, householdId) {
  return prisma.shoppingList.findFirst({
    where: { id, householdId },
    include: LIST_INCLUDE,
  });
}

export function createList({ householdId, createdById, name, notes }) {
  return prisma.shoppingList.create({
    data: { householdId, createdById, name, notes },
    include: LIST_INCLUDE,
  });
}

export function updateList(id, householdId, data) {
  return prisma.shoppingList.update({
    where: { id, householdId },
    data,
    include: LIST_INCLUDE,
  });
}

export function deleteList(id, householdId) {
  return prisma.shoppingList.delete({ where: { id, householdId } });
}

// Item changes bump the list so the most recently worked-on list wins the
// dashboard's "active list" slot.
export function touchList(id) {
  return prisma.shoppingList.update({ where: { id }, data: { updatedAt: new Date() } });
}

// Remaining (unpurchased) counts for a page of lists, in one query.
export function countRemainingByListIds(listIds) {
  if (!listIds.length) {
    return Promise.resolve([]);
  }
  return prisma.shoppingListItem.groupBy({
    by: ['listId'],
    where: { listId: { in: listIds }, purchasedAt: null },
    _count: { listId: true },
  });
}

export function buildItemWhere(listId, query = {}) {
  const where = { listId };
  if (query.purchased === true) {
    where.purchasedAt = { not: null };
  } else if (query.purchased === false) {
    where.purchasedAt = null;
  }
  if (query.category) {
    where.category = query.category;
  }
  if (query.search) {
    where.name = { contains: escapeLike(query.search), mode: 'insensitive' };
  }
  return where;
}

export function countItems(where) {
  return prisma.shoppingListItem.count({ where });
}

export function listItems(where, query) {
  return prisma.shoppingListItem.findMany({
    where,
    include: ITEM_INCLUDE,
    // Unpurchased first, then grouped by category and name.
    orderBy: [
      { purchasedAt: { sort: 'asc', nulls: 'first' } },
      { category: 'asc' },
      { normalized: 'asc' },
      { createdAt: 'asc' },
    ],
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
}

export function countRemainingInList(listId) {
  return prisma.shoppingListItem.count({ where: { listId, purchasedAt: null } });
}

export function findItemById(id, listId) {
  return prisma.shoppingListItem.findFirst({
    where: { id, listId },
    include: ITEM_INCLUDE,
  });
}

export function createItem(data) {
  return prisma.shoppingListItem.create({ data, include: ITEM_INCLUDE });
}

export function updateItem(id, listId, data) {
  return prisma.shoppingListItem.update({
    where: { id, listId },
    data,
    include: ITEM_INCLUDE,
  });
}

export function deleteItem(id, listId) {
  return prisma.shoppingListItem.delete({ where: { id, listId } });
}

// Merge candidates: unpurchased rows with the same normalized name; the unit
// comparison happens in the service (units are stored with display casing).
export function listOpenItemsByNormalized(listId, normalized) {
  return prisma.shoppingListItem.findMany({
    where: { listId, normalized, purchasedAt: null },
    include: ITEM_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
}

export function listItemsForList(listId) {
  return prisma.shoppingListItem.findMany({
    where: { listId },
    include: ITEM_INCLUDE,
    orderBy: [{ purchasedAt: { sort: 'asc', nulls: 'first' } }, { normalized: 'asc' }],
  });
}

// ---- Dashboard ----

export function countActiveLists(householdId) {
  return prisma.shoppingList.count({ where: { householdId, archivedAt: null } });
}

export function findActiveList(householdId) {
  return prisma.shoppingList.findFirst({
    where: { householdId, archivedAt: null },
    include: LIST_INCLUDE,
    orderBy: { updatedAt: 'desc' },
  });
}

export function countRemainingForHousehold(householdId) {
  return prisma.shoppingListItem.count({
    where: { purchasedAt: null, list: { householdId, archivedAt: null } },
  });
}

export function listShoppingForExport(householdId) {
  return prisma.shoppingList.findMany({
    where: { householdId },
    include: {
      items: {
        include: { recipe: { select: { id: true, title: true } } },
        orderBy: [
          { purchasedAt: { sort: 'asc', nulls: 'first' } },
          { category: 'asc' },
          { normalized: 'asc' },
        ],
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
}
