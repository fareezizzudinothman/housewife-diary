import { prisma } from '../utils/prisma.js';

const ITEM_SELECT = {
  id: true,
  householdId: true,
  name: true,
  normalized: true,
  quantity: true,
  unit: true,
  category: true,
  location: true,
  expiresAt: true,
  minimumQuantity: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
};

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

// `bounds` = { today, soonEnd } as UTC-midnight Dates for the user's local
// today and the expiring-soon horizon.
export function buildInventoryWhere(householdId, query = {}, bounds) {
  const where = { householdId };

  if (query.search) {
    where.name = { contains: escapeLike(query.search), mode: 'insensitive' };
  }
  if (query.category) {
    where.category = query.category;
  }
  if (query.location) {
    where.location = query.location;
  }

  if (query.stock === 'out_of_stock') {
    where.quantity = { lte: 0 };
  } else if (query.stock === 'low_stock') {
    where.AND = [
      { quantity: { gt: 0 } },
      { quantity: { lte: prisma.inventoryItem.fields.minimumQuantity } },
    ];
  } else if (query.stock === 'in_stock') {
    where.AND = [
      { quantity: { gt: 0 } },
      { quantity: { gt: prisma.inventoryItem.fields.minimumQuantity } },
    ];
  }

  if (query.expiry === 'expired') {
    where.expiresAt = { lt: bounds.today };
  } else if (query.expiry === 'expiring_soon') {
    where.expiresAt = { gte: bounds.today, lte: bounds.soonEnd };
  } else if (query.expiry === 'none') {
    where.expiresAt = null;
  }

  return where;
}

export function countInventory(where) {
  return prisma.inventoryItem.count({ where });
}

export function listInventory(where, query) {
  return prisma.inventoryItem.findMany({
    where,
    orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { normalized: 'asc' }],
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
}

export function findInventoryItemById(id, householdId) {
  return prisma.inventoryItem.findFirst({ where: { id, householdId } });
}

// Creates the item and records the opening balance as a PURCHASE transaction
// so every quantity in the ledger can be reconstructed.
export function createInventoryItem(data, { userId, type = 'PURCHASE', note = 'Initial stock' }) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({ data });
    if (Number(data.quantity) > 0) {
      await tx.inventoryTransaction.create({
        data: {
          householdId: item.householdId,
          itemId: item.id,
          createdById: userId,
          type,
          quantityDelta: data.quantity,
          quantityAfter: data.quantity,
          note,
        },
      });
    }
    return item;
  });
}

export function updateInventoryItem(id, householdId, data) {
  return prisma.inventoryItem.update({ where: { id, householdId }, data });
}

export function deleteInventoryItem(id, householdId) {
  return prisma.inventoryItem.delete({ where: { id, householdId } });
}

// Applies a quantity change and records it atomically.
export function applyQuantityChange(item, { userId, type, delta, after, note }) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.inventoryItem.update({
      where: { id: item.id },
      data: { quantity: after },
    });
    const transaction = await tx.inventoryTransaction.create({
      data: {
        householdId: item.householdId,
        itemId: item.id,
        createdById: userId,
        type,
        quantityDelta: delta,
        quantityAfter: after,
        note,
      },
    });
    return { item: updated, transaction };
  });
}

export function countTransactions(itemId) {
  return prisma.inventoryTransaction.count({ where: { itemId } });
}

export function listTransactions(itemId, query) {
  return prisma.inventoryTransaction.findMany({
    where: { itemId },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
}

// Merge candidates for shopping → inventory (unit matching happens in the
// service because units keep their display casing).
export function listItemsByNormalized(householdId, normalized) {
  return prisma.inventoryItem.findMany({
    where: { householdId, normalized },
    select: ITEM_SELECT,
  });
}

export function countOutOfStock(householdId) {
  return prisma.inventoryItem.count({ where: { householdId, quantity: { lte: 0 } } });
}

export function countLowStock(householdId) {
  return prisma.inventoryItem.count({
    where: {
      householdId,
      AND: [
        { quantity: { gt: 0 } },
        { quantity: { lte: prisma.inventoryItem.fields.minimumQuantity } },
      ],
    },
  });
}

export function countExpiringSoon(householdId, today, soonEnd) {
  return prisma.inventoryItem.count({
    where: { householdId, expiresAt: { gte: today, lte: soonEnd } },
  });
}

export function countExpired(householdId, today) {
  return prisma.inventoryItem.count({
    where: { householdId, expiresAt: { lt: today } },
  });
}

// Alert candidates (any stock or expiry condition), capped for the dashboard.
export function listAlertCandidates(householdId, today, soonEnd, limit) {
  return prisma.inventoryItem.findMany({
    where: {
      householdId,
      OR: [
        { quantity: { lte: 0 } },
        { AND: [{ quantity: { gt: 0 } }, { quantity: { lte: prisma.inventoryItem.fields.minimumQuantity } }] },
        { expiresAt: { lt: today } },
        { expiresAt: { gte: today, lte: soonEnd } },
      ],
    },
    select: ITEM_SELECT,
    orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { normalized: 'asc' }],
    take: limit,
  });
}

export function listInventoryForExport(householdId) {
  return prisma.inventoryItem.findMany({
    where: { householdId },
    orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { normalized: 'asc' }],
  });
}
