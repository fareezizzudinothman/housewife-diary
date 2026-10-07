import { AppError, ErrorCodes } from '../../shared/errors.js';
import { fieldError, throwValidationError } from '../validators/shared.js';
import * as inventoryRepository from '../repositories/inventoryRepository.js';
import { decimalToNumber } from '../utils/decimal.js';
import { parseDateString } from '../validators/format.js';
import { DAY_MS } from '../utils/recurrence.js';
import { toDateString } from '../utils/time.js';

const EXPIRING_SOON_DAYS = 7;

function notFound() {
  return new AppError('Inventory item not found.', {
    code: ErrorCodes.NOT_FOUND,
    status: 404,
  });
}

// Conservative day boundaries for expiry checks: the user's local today
// converted to the UTC midnight stored in the DATE column.
export function dateBounds(timezone, now = new Date()) {
  const today = parseDateString(toDateString(now, timezone));
  const soonEnd = new Date(today.getTime() + EXPIRING_SOON_DAYS * DAY_MS);
  return { today, soonEnd };
}

// Statuses are derived, never stored: stock level from quantity vs minimum,
// expiry from the date column and the 7-day horizon.
export function deriveStatus(item, bounds) {
  const quantity = decimalToNumber(item.quantity) ?? 0;
  const minimum = decimalToNumber(item.minimumQuantity) ?? 0;
  let status = 'IN_STOCK';
  if (quantity <= 0) {
    status = 'OUT_OF_STOCK';
  } else if (quantity <= minimum) {
    status = 'LOW_STOCK';
  }

  let expiryStatus = null;
  if (item.expiresAt) {
    if (item.expiresAt.getTime() < bounds.today.getTime()) {
      expiryStatus = 'EXPIRED';
    } else if (item.expiresAt.getTime() <= bounds.soonEnd.getTime()) {
      expiryStatus = 'EXPIRING_SOON';
    }
  }
  return { status, expiryStatus };
}

function toItemView(item, bounds) {
  return {
    id: item.id,
    name: item.name,
    quantity: decimalToNumber(item.quantity) ?? 0,
    unit: item.unit,
    category: item.category,
    location: item.location,
    expiresAt: item.expiresAt ? item.expiresAt.toISOString().slice(0, 10) : null,
    minimumQuantity: decimalToNumber(item.minimumQuantity) ?? 0,
    notes: item.notes,
    ...deriveStatus(item, bounds),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toTransactionView(transaction) {
  return {
    id: transaction.id,
    type: transaction.type,
    quantityDelta: decimalToNumber(transaction.quantityDelta) ?? 0,
    quantityAfter: decimalToNumber(transaction.quantityAfter) ?? 0,
    note: transaction.note,
    createdBy: transaction.createdBy
      ? { id: transaction.createdBy.id, name: transaction.createdBy.name }
      : null,
    createdAt: transaction.createdAt,
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function ensureNonNegative(after) {
  if (after < 0) {
    throwValidationError([fieldError('quantity', 'Not enough stock for this change.')]);
  }
}

export async function listInventory({ user, householdId, query }) {
  const bounds = dateBounds(user.timezone ?? 'UTC');
  const where = inventoryRepository.buildInventoryWhere(householdId, query, bounds);
  const [total, items] = await Promise.all([
    inventoryRepository.countInventory(where),
    inventoryRepository.listInventory(where, query),
  ]);
  return {
    items: items.map((item) => toItemView(item, bounds)),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getInventoryItem({ user, householdId, id }) {
  const item = await inventoryRepository.findInventoryItemById(id, householdId);
  if (!item) {
    throw notFound();
  }
  return toItemView(item, dateBounds(user.timezone ?? 'UTC'));
}

export async function createInventoryItem({ user, householdId, data }) {
  const item = await inventoryRepository.createInventoryItem(
    { ...data, householdId, createdById: user.id },
    { userId: user.id },
  );
  return toItemView(item, dateBounds(user.timezone ?? 'UTC'));
}

export async function updateInventoryItem({ user, householdId, id, patch }) {
  const item = await inventoryRepository.findInventoryItemById(id, householdId);
  if (!item) {
    throw notFound();
  }
  const updated = await inventoryRepository.updateInventoryItem(id, householdId, patch);
  return toItemView(updated, dateBounds(user.timezone ?? 'UTC'));
}

export async function deleteInventoryItem({ householdId, id }) {
  const item = await inventoryRepository.findInventoryItemById(id, householdId);
  if (!item) {
    throw notFound();
  }
  await inventoryRepository.deleteInventoryItem(id, householdId);
  return { id, deleted: true };
}

async function applyChange({ user, householdId, id, type, delta, absolute, note }) {
  const item = await inventoryRepository.findInventoryItemById(id, householdId);
  if (!item) {
    throw notFound();
  }
  const before = decimalToNumber(item.quantity) ?? 0;
  const after = round(absolute !== undefined ? absolute : before + delta);
  ensureNonNegative(after);
  const effectiveDelta = round(after - before);
  const result = await inventoryRepository.applyQuantityChange(item, {
    userId: user.id,
    type,
    delta: effectiveDelta,
    after,
    note,
  });
  const bounds = dateBounds(user.timezone ?? 'UTC');
  return {
    item: toItemView(result.item, bounds),
    transaction: toTransactionView(result.transaction),
  };
}

export async function consumeItem({ user, householdId, id, data }) {
  return applyChange({
    user,
    householdId,
    id,
    type: 'CONSUME',
    delta: -data.quantity,
    note: data.note,
  });
}

export async function wasteItem({ user, householdId, id, data }) {
  return applyChange({
    user,
    householdId,
    id,
    type: 'WASTE',
    delta: -data.quantity,
    note: data.note,
  });
}

export async function addStock({ user, householdId, id, data }) {
  return applyChange({
    user,
    householdId,
    id,
    type: 'PURCHASE',
    delta: data.quantity,
    note: data.note,
  });
}

export async function adjustStock({ user, householdId, id, data }) {
  return applyChange({
    user,
    householdId,
    id,
    type: 'ADJUST',
    absolute: data.quantity,
    note: data.note,
  });
}

export async function listTransactions({ householdId, id, query }) {
  const item = await inventoryRepository.findInventoryItemById(id, householdId);
  if (!item) {
    throw notFound();
  }
  const [total, transactions] = await Promise.all([
    inventoryRepository.countTransactions(id),
    inventoryRepository.listTransactions(id, query),
  ]);
  return {
    items: transactions.map(toTransactionView),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

// ---- Shopping -> inventory (explicit user action) ----

// Merges into an existing item with the same normalized name + unit; the
// purchase is always recorded as a transaction. Units are not convertible,
// so a different unit creates a separate inventory item.
export async function addFromShopping({ user, householdId, incoming }) {
  const quantity = incoming.quantity ?? 1;
  const unitKey = (incoming.unit ?? '').toLowerCase();
  const candidates = await inventoryRepository.listItemsByNormalized(
    householdId,
    incoming.normalized,
  );
  const match = candidates.find((candidate) => (candidate.unit ?? '').toLowerCase() === unitKey);
  const bounds = dateBounds(user.timezone ?? 'UTC');

  if (match) {
    const updates = {};
    if (incoming.category && incoming.category !== 'OTHER') {
      updates.category = incoming.category;
    }
    if (incoming.location) {
      updates.location = incoming.location;
    }
    if (incoming.expiresAt) {
      updates.expiresAt = incoming.expiresAt;
    }
    if (Object.keys(updates).length) {
      await inventoryRepository.updateInventoryItem(match.id, householdId, updates);
    }
    const before = decimalToNumber(match.quantity) ?? 0;
    const after = round(before + quantity);
    const result = await inventoryRepository.applyQuantityChange(match, {
      userId: user.id,
      type: 'PURCHASE',
      delta: quantity,
      after,
      note: incoming.note ?? 'Added from a shopping list',
    });
    return { item: toItemView(result.item, bounds), merged: true };
  }

  const created = await inventoryRepository.createInventoryItem(
    {
      householdId,
      createdById: user.id,
      name: incoming.name,
      normalized: incoming.normalized,
      quantity,
      unit: incoming.unit ?? null,
      category: incoming.category ?? 'OTHER',
      location: incoming.location ?? 'PANTRY',
      expiresAt: incoming.expiresAt ?? null,
      minimumQuantity: 0,
      notes: null,
    },
    { userId: user.id, note: incoming.note ?? 'Added from a shopping list' },
  );
  return { item: toItemView(created, bounds), merged: false };
}

// ---- Dashboard ----

const ALERT_SEVERITY = { EXPIRED: 0, OUT_OF_STOCK: 1, EXPIRING_SOON: 2, LOW_STOCK: 3 };

export async function getInventoryAlerts({ householdId, timezone, limit = 3 }) {
  const bounds = dateBounds(timezone);
  const [lowStockCount, outOfStockCount, expiringSoonCount, expiredCount, candidates] =
    await Promise.all([
      inventoryRepository.countLowStock(householdId),
      inventoryRepository.countOutOfStock(householdId),
      inventoryRepository.countExpiringSoon(householdId, bounds.today, bounds.soonEnd),
      inventoryRepository.countExpired(householdId, bounds.today),
      inventoryRepository.listAlertCandidates(householdId, bounds.today, bounds.soonEnd, 25),
    ]);

  const alerts = candidates
    .map((item) => {
      const derived = deriveStatus(item, bounds);
      return {
        id: item.id,
        name: item.name,
        quantity: decimalToNumber(item.quantity) ?? 0,
        unit: item.unit,
        expiresAt: item.expiresAt ? item.expiresAt.toISOString().slice(0, 10) : null,
        ...derived,
      };
    })
    .sort((a, b) => {
      const severityA = ALERT_SEVERITY[a.expiryStatus ?? a.status] ?? 9;
      const severityB = ALERT_SEVERITY[b.expiryStatus ?? b.status] ?? 9;
      return severityA - severityB || (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999');
    })
    .slice(0, limit);

  return { lowStockCount, outOfStockCount, expiringSoonCount, expiredCount, alerts };
}

export { toItemView };
