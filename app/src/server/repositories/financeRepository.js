import { prisma } from '../utils/prisma.js';
import { Decimal } from '../utils/money.js';

// All finance data access lives here. Money aggregates return Decimals; the
// service converts them to 2-decimal strings for the API (see docs/finance.md).

const CATEGORY_SELECT = { id: true, name: true, type: true, icon: true };
const ACCOUNT_SELECT = { id: true, name: true, type: true, currency: true, active: true };
const TRANSACTION_INCLUDE = {
  category: { select: CATEGORY_SELECT },
  account: { select: ACCOUNT_SELECT },
  counterAccount: { select: ACCOUNT_SELECT },
  createdBy: { select: { id: true, name: true } },
  receipt: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
};

// Party list shape used by the report and dashboard.
const PARTY_SELECT = {
  category: { select: CATEGORY_SELECT },
  account: { select: ACCOUNT_SELECT },
  counterAccount: { select: ACCOUNT_SELECT },
};

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

// ---- Accounts ----

export function listAccounts(householdId, query) {
  return prisma.financeAccount.findMany({
    where: {
      householdId,
      ...(query.includeArchived ? {} : { active: true }),
    },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
}

export function countAccounts(householdId, query) {
  return prisma.financeAccount.count({
    where: { householdId, ...(query.includeArchived ? {} : { active: true }) },
  });
}

export function findAccountById(id, householdId) {
  return prisma.financeAccount.findFirst({ where: { id, householdId } });
}

export function findAccountByNormalized(householdId, normalized, excludeId = null) {
  return prisma.financeAccount.findFirst({
    where: {
      householdId,
      normalized,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
}

export function createAccount(data) {
  return prisma.financeAccount.create({ data });
}

export function updateAccount(id, householdId, data) {
  return prisma.financeAccount.update({ where: { id, householdId }, data });
}

export function countAccountTransactions(accountId) {
  return prisma.financialTransaction.count({
    where: { OR: [{ accountId }, { counterAccountId: accountId }] },
  });
}

// Posted movement per account, in one pass per direction. Returns a map
// accountId -> { income, expense, transferIn, transferOut } of Decimals.
export async function accountMovementByAccount(householdId) {
  const [flows, transfersOut, transfersIn] = await Promise.all([
    prisma.financialTransaction.groupBy({
      by: ['accountId', 'type'],
      where: {
        householdId,
        status: 'POSTED',
        accountId: { not: null },
        type: { in: ['INCOME', 'EXPENSE'] },
      },
      _sum: { amount: true },
    }),
    prisma.financialTransaction.groupBy({
      by: ['accountId'],
      where: { householdId, status: 'POSTED', type: 'TRANSFER', accountId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.financialTransaction.groupBy({
      by: ['counterAccountId'],
      where: {
        householdId,
        status: 'POSTED',
        type: 'TRANSFER',
        counterAccountId: { not: null },
      },
      _sum: { amount: true },
    }),
  ]);

  const movement = new Map();
  const entry = (id) => {
    let value = movement.get(id);
    if (!value) {
      value = {
        income: new Decimal(0),
        expense: new Decimal(0),
        transferIn: new Decimal(0),
        transferOut: new Decimal(0),
      };
      movement.set(id, value);
    }
    return value;
  };

  for (const row of flows) {
    if (row.type === 'INCOME') {
      entry(row.accountId).income = entry(row.accountId).income.plus(row._sum.amount ?? 0);
    } else if (row.type === 'EXPENSE') {
      entry(row.accountId).expense = entry(row.accountId).expense.plus(row._sum.amount ?? 0);
    }
  }
  for (const row of transfersOut) {
    entry(row.accountId).transferOut = entry(row.accountId).transferOut.plus(row._sum.amount ?? 0);
  }
  for (const row of transfersIn) {
    entry(row.counterAccountId).transferIn = entry(row.counterAccountId).transferIn.plus(
      row._sum.amount ?? 0,
    );
  }
  return movement;
}

export function accountBalancesRaw(householdId) {
  return Promise.all([
    prisma.financeAccount.findMany({
      where: { householdId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    }),
    accountMovementByAccount(householdId),
  ]);
}

export function findFirstAccount(householdId) {
  return prisma.financeAccount.findFirst({
    where: { householdId },
    orderBy: { createdAt: 'asc' },
  });
}

// ---- Categories ----

export function listCategories(householdId, query) {
  return prisma.financeCategory.findMany({
    where: {
      OR: [{ householdId }, { householdId: null }],
      ...(query.type ? { type: query.type } : {}),
      ...(query.includeArchived ? {} : { active: true }),
    },
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
}

export function countCategories(householdId, query) {
  return prisma.financeCategory.count({
    where: {
      OR: [{ householdId }, { householdId: null }],
      ...(query.type ? { type: query.type } : {}),
      ...(query.includeArchived ? {} : { active: true }),
    },
  });
}

export function countHouseholdCategories(householdId) {
  return prisma.financeCategory.count({ where: { householdId } });
}

export function findCategoryById(id) {
  return prisma.financeCategory.findUnique({ where: { id } });
}

export function findCategoryByNormalized(householdId, type, normalized, excludeId = null) {
  return prisma.financeCategory.findFirst({
    where: {
      householdId,
      type,
      normalized,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
}

export function createCategory(data) {
  return prisma.financeCategory.create({ data });
}

export function updateCategory(id, householdId, data) {
  return prisma.financeCategory.update({ where: { id, householdId }, data });
}

export async function categoryUsageByHousehold(householdId) {
  const rows = await prisma.financialTransaction.groupBy({
    by: ['categoryId'],
    where: { householdId, categoryId: { not: null } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.categoryId, row._count._all]));
}

// ---- Transactions ----

export function buildTransactionWhere(householdId, query) {
  const where = { householdId };

  if (query.status !== 'ALL') {
    where.status = query.status;
  }
  if (query.type) {
    where.type = query.type;
  }
  if (query.categoryId) {
    where.categoryId = query.categoryId;
  }
  // An account filter matches transfers on either side.
  if (query.accountId) {
    where.OR = [{ accountId: query.accountId }, { counterAccountId: query.accountId }];
  }
  if (query.sourceType) {
    where.sourceType = query.sourceType;
  }
  if (query.from || query.to) {
    where.transactionDate = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  if (query.search) {
    const contains = escapeLike(query.search);
    const searchOr = [
      { description: { contains, mode: 'insensitive' } },
      { merchant: { contains, mode: 'insensitive' } },
    ];
    // Preserve the account OR clause.
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchOr }];
      delete where.OR;
    } else {
      where.OR = searchOr;
    }
  }
  return where;
}

export function listTransactions(where, query) {
  return prisma.financialTransaction.findMany({
    where,
    include: TRANSACTION_INCLUDE,
    orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
}

export function countTransactions(where) {
  return prisma.financialTransaction.count({ where });
}

export function findTransactionById(id, householdId) {
  return prisma.financialTransaction.findFirst({
    where: { id, householdId },
    include: TRANSACTION_INCLUDE,
  });
}

export function createTransaction(data) {
  return prisma.financialTransaction.create({ data, include: TRANSACTION_INCLUDE });
}

export function updateTransaction(id, householdId, data) {
  return prisma.financialTransaction.update({
    where: { id, householdId },
    data,
    include: TRANSACTION_INCLUDE,
  });
}

export function voidTransaction(id, householdId, { voidedById, voidReason }) {
  return prisma.financialTransaction.update({
    where: { id, householdId },
    data: { status: 'VOIDED', voidedAt: new Date(), voidedById, voidReason },
    include: TRANSACTION_INCLUDE,
  });
}

// Voiding a bill payment reopens the bill in the same transaction so a bill
// can never stay PAID without its settling expense.
export function voidTransactionAtomically({ id, householdId, transaction, voidedById, voidReason }) {
  return prisma.$transaction(async (tx) => {
    const voided = await tx.financialTransaction.update({
      where: { id, householdId },
      data: { status: 'VOIDED', voidedAt: new Date(), voidedById, voidReason },
      include: TRANSACTION_INCLUDE,
    });
    if (transaction.sourceType === 'BILL' && transaction.sourceId) {
      await tx.financeBill.updateMany({
        where: { id: transaction.sourceId, householdId, status: 'PAID' },
        data: { status: 'UPCOMING', paidAt: null, paidTransactionId: null },
      });
      await tx.financeBill.updateMany({
        where: { paidTransactionId: id, householdId },
        data: { paidTransactionId: null },
      });
    }
    return voided;
  });
}

export function findTransactionByBillId(householdId, billId) {
  return prisma.financialTransaction.findFirst({
    where: { householdId, sourceType: 'BILL', sourceId: billId },
  });
}

// ---- Receipts ----

export function findReceiptByTransaction(transactionId) {
  return prisma.financeReceipt.findUnique({ where: { transactionId } });
}

export function createReceipt(transactionId, data) {
  return prisma.financeReceipt.create({ data: { transactionId, ...data } });
}

export function deleteReceipt(id) {
  return prisma.financeReceipt.delete({ where: { id } });
}

// ---- Reports ----

// Totals per type (income/expense/transfer) for a posted window.
export function totalsByType(where) {
  return prisma.financialTransaction.groupBy({
    by: ['type'],
    where,
    _sum: { amount: true },
    _count: { _all: true },
  });
}

// Totals per category for one type (income or expense).
export function totalsByCategory(where) {
  return prisma.financialTransaction.groupBy({
    by: ['categoryId'],
    where,
    _sum: { amount: true },
    _count: { _all: true },
  });
}

export function listCategoriesByIds(ids) {
  if (!ids.length) {
    return Promise.resolve([]);
  }
  return prisma.financeCategory.findMany({ where: { id: { in: ids } } });
}

export function transactionActivityCurrencies(householdId, from, to) {
  return prisma.financialTransaction.findMany({
    where: { householdId, transactionDate: { gte: from, lt: to } },
    distinct: ['currency'],
    select: { currency: true },
  });
}

export function householdCurrencies(householdId) {
  return prisma.financeAccount.findMany({
    where: { householdId },
    distinct: ['currency'],
    select: { currency: true },
  });
}

// ---- Budgets ----

export function listBudgets(householdId, query) {
  return prisma.financeBudget.findMany({
    where: {
      householdId,
      ...(query.year ? { year: query.year } : {}),
      ...(query.month ? { month: query.month } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    },
    include: { category: { select: CATEGORY_SELECT } },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'asc' }],
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
}

export function countBudgets(householdId, query) {
  return prisma.financeBudget.count({
    where: {
      householdId,
      ...(query.year ? { year: query.year } : {}),
      ...(query.month ? { month: query.month } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    },
  });
}

export function findBudgetById(id, householdId) {
  return prisma.financeBudget.findFirst({
    where: { id, householdId },
    include: { category: { select: CATEGORY_SELECT } },
  });
}

export function createBudget(data) {
  return prisma.financeBudget.create({
    data,
    include: { category: { select: CATEGORY_SELECT } },
  });
}

export function updateBudget(id, householdId, data) {
  return prisma.financeBudget.update({
    where: { id, householdId },
    data,
    include: { category: { select: CATEGORY_SELECT } },
  });
}

export function deleteBudget(id, householdId) {
  return prisma.financeBudget.delete({ where: { id, householdId } });
}

// Actual posted expense per category for a month/currency.
export function budgetSpendByCategory(householdId, { from, to, currency, categoryIds }) {
  return prisma.financialTransaction.groupBy({
    by: ['categoryId'],
    where: {
      householdId,
      status: 'POSTED',
      type: 'EXPENSE',
      currency,
      categoryId: { in: categoryIds },
      transactionDate: { gte: from, lt: to },
    },
    _sum: { amount: true },
  });
}

// ---- Bills ----

// Derived-status filters: the stored column only knows UPCOMING/PAID/CANCELLED.
export function buildBillWhere(householdId, query, bounds) {
  const where = { householdId };
  const { today } = bounds;

  if (query.status === 'PAID') {
    where.status = 'PAID';
  } else if (query.status === 'CANCELLED') {
    where.status = 'CANCELLED';
  } else if (query.status === 'UPCOMING') {
    where.status = 'UPCOMING';
    where.dueDate = { gt: today };
  } else if (query.status === 'DUE') {
    where.status = 'UPCOMING';
    where.dueDate = today;
  } else if (query.status === 'OVERDUE') {
    where.status = 'UPCOMING';
    where.dueDate = { lt: today };
  } else {
    // ALL: hide cancelled bills by default? No — status=ALL means everything.
  }

  if (query.categoryId) {
    where.categoryId = query.categoryId;
  }
  if (query.search) {
    where.name = { contains: escapeLike(query.search), mode: 'insensitive' };
  }
  return where;
}

export function listBills(where, query) {
  return prisma.financeBill.findMany({
    where,
    include: {
      category: { select: CATEGORY_SELECT },
      account: { select: ACCOUNT_SELECT },
      paidTransaction: { select: { id: true, transactionDate: true, amount: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
}

export function countBills(where) {
  return prisma.financeBill.count({ where });
}

export function findBillById(id, householdId) {
  return prisma.financeBill.findFirst({
    where: { id, householdId },
    include: {
      category: { select: CATEGORY_SELECT },
      account: { select: ACCOUNT_SELECT },
      paidTransaction: { select: { id: true, transactionDate: true, amount: true } },
    },
  });
}

export function createBill(data) {
  return prisma.financeBill.create({
    data,
    include: { category: { select: CATEGORY_SELECT }, account: { select: ACCOUNT_SELECT } },
  });
}

export function updateBill(id, householdId, data) {
  return prisma.financeBill.update({
    where: { id, householdId },
    data,
    include: { category: { select: CATEGORY_SELECT }, account: { select: ACCOUNT_SELECT } },
  });
}

// Atomic duplicate-payment guard: only an UPCOMING bill can transition to
// PAID; a second attempt updates nothing.
export function markBillPaid(id, householdId, { paidAt }) {
  return prisma.financeBill.updateMany({
    where: { id, householdId, status: 'UPCOMING' },
    data: { status: 'PAID', paidAt, cancelledAt: null },
  });
}

export function attachBillPayment(id, householdId, transactionId) {
  return prisma.financeBill.update({
    where: { id, householdId },
    data: { paidTransactionId: transactionId },
    include: { category: { select: CATEGORY_SELECT }, account: { select: ACCOUNT_SELECT } },
  });
}

// Settles an UPCOMING bill and records the linked expense atomically. A
// concurrent/second call updates nothing and the transaction is rolled back.
export function payBillAtomically({ billId, householdId, transactionData, paidAt }) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.financeBill.updateMany({
      where: { id: billId, householdId, status: 'UPCOMING' },
      data: { status: 'PAID', paidAt, cancelledAt: null },
    });
    if (claimed.count === 0) {
      return null;
    }
    const created = await tx.financialTransaction.create({
      data: transactionData,
      include: TRANSACTION_INCLUDE,
    });
    await tx.financeBill.update({
      where: { id: billId },
      data: { paidTransactionId: created.id },
    });
    return created;
  });
}

export function reopenBillAfterVoid(id, householdId) {
  return prisma.financeBill.updateMany({
    where: { id, householdId, status: 'PAID' },
    data: { status: 'UPCOMING', paidAt: null, paidTransactionId: null },
  });
}

export function cancelBill(id, householdId) {
  return prisma.financeBill.updateMany({
    where: { id, householdId, status: 'UPCOMING' },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
}

export function countBillsByStoredStatus(householdId) {
  return prisma.financeBill.groupBy({
    by: ['status'],
    where: { householdId },
    _count: { _all: true },
  });
}

export function countBillsDueBetween(householdId, from, to) {
  return prisma.financeBill.count({
    where: { householdId, status: 'UPCOMING', dueDate: { gte: from, lte: to } },
  });
}

export function countOverdueBills(householdId, today) {
  return prisma.financeBill.count({
    where: { householdId, status: 'UPCOMING', dueDate: { lt: today } },
  });
}

export function listUpcomingBills(householdId, today, limit) {
  return prisma.financeBill.findMany({
    where: { householdId, status: 'UPCOMING', dueDate: { gte: today } },
    include: { category: { select: CATEGORY_SELECT } },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    take: limit,
  });
}

// Unpaid bills whose due date falls inside a calendar range (date-only
// comparison, matching the @db.Date column semantics).
export function listBillsForCalendar(householdId, from, to) {
  return prisma.financeBill.findMany({
    where: { householdId, status: 'UPCOMING', dueDate: { gte: from, lte: to } },
    include: { category: { select: CATEGORY_SELECT } },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
  });
}

// ---- Recurring transactions ----

export function listRecurring(householdId, query) {
  return prisma.financeRecurringTransaction.findMany({
    where: {
      householdId,
      ...(query.active === 'ACTIVE' ? { active: true } : {}),
      ...(query.active === 'PAUSED' ? { active: false } : {}),
      ...(query.type ? { type: query.type } : {}),
    },
    include: {
      category: { select: CATEGORY_SELECT },
      account: { select: ACCOUNT_SELECT },
      _count: { select: { transactions: true } },
    },
    orderBy: [{ active: 'desc' }, { nextOccurrence: 'asc' }, { createdAt: 'asc' }],
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
}

export function countRecurring(householdId, query) {
  return prisma.financeRecurringTransaction.count({
    where: {
      householdId,
      ...(query.active === 'ACTIVE' ? { active: true } : {}),
      ...(query.active === 'PAUSED' ? { active: false } : {}),
      ...(query.type ? { type: query.type } : {}),
    },
  });
}

export function findRecurringById(id, householdId) {
  return prisma.financeRecurringTransaction.findFirst({
    where: { id, householdId },
    include: {
      category: { select: CATEGORY_SELECT },
      account: { select: ACCOUNT_SELECT },
      _count: { select: { transactions: true } },
    },
  });
}

export function createRecurring(data) {
  return prisma.financeRecurringTransaction.create({
    data,
    include: {
      category: { select: CATEGORY_SELECT },
      account: { select: ACCOUNT_SELECT },
      _count: { select: { transactions: true } },
    },
  });
}

export function updateRecurring(id, householdId, data) {
  return prisma.financeRecurringTransaction.update({
    where: { id, householdId },
    data,
    include: {
      category: { select: CATEGORY_SELECT },
      account: { select: ACCOUNT_SELECT },
      _count: { select: { transactions: true } },
    },
  });
}

export function setRecurringActive(id, householdId, active) {
  return prisma.financeRecurringTransaction.update({
    where: { id, householdId },
    data: { active },
    include: {
      category: { select: CATEGORY_SELECT },
      account: { select: ACCOUNT_SELECT },
      _count: { select: { transactions: true } },
    },
  });
}

export function listDueRecurring(householdId, today) {
  return prisma.financeRecurringTransaction.findMany({
    where: {
      householdId,
      active: true,
      nextOccurrence: { not: null, lte: today },
    },
    orderBy: { nextOccurrence: 'asc' },
  });
}

// skipDuplicates relies on @@unique([recurringTransactionId, transactionDate]).
export function createRecurringTransactions(rows) {
  if (!rows.length) {
    return Promise.resolve({ count: 0 });
  }
  return prisma.financialTransaction.createMany({ data: rows, skipDuplicates: true });
}

export function advanceRecurringCursor(id, householdId, nextOccurrence) {
  return prisma.financeRecurringTransaction.update({
    where: { id, householdId },
    data: { nextOccurrence },
  });
}

export function latestRecurringTransactionDate(recurringId) {
  return prisma.financialTransaction.findFirst({
    where: { recurringTransactionId: recurringId },
    orderBy: { transactionDate: 'desc' },
    select: { transactionDate: true },
  });
}

export function countRecurringTransactions(recurringId) {
  return prisma.financialTransaction.count({ where: { recurringTransactionId: recurringId } });
}

export function countHouseholdRecurring(householdId) {
  return prisma.financeRecurringTransaction.count({ where: { householdId } });
}

export function countHouseholdTransactions(householdId) {
  return prisma.financialTransaction.count({ where: { householdId } });
}

export async function exportFinanceData(householdId) {
  const [accounts, categories, transactions, budgets, bills, recurring] = await Promise.all([
    prisma.financeAccount.findMany({ where: { householdId }, orderBy: { createdAt: 'asc' } }),
    prisma.financeCategory.findMany({ where: { OR: [{ householdId }, { householdId: null }] }, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.financialTransaction.findMany({ where: { householdId }, include: { category: { select: { id: true, name: true, type: true } }, account: { select: { id: true, name: true } }, counterAccount: { select: { id: true, name: true } } }, orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }] }),
    prisma.financeBudget.findMany({ where: { householdId }, include: { category: { select: { id: true, name: true, type: true } } }, orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
    prisma.financeBill.findMany({ where: { householdId }, include: { category: { select: { id: true, name: true, type: true } }, account: { select: { id: true, name: true } } }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }] }),
    prisma.financeRecurringTransaction.findMany({ where: { householdId }, include: { category: { select: { id: true, name: true, type: true } }, account: { select: { id: true, name: true } } }, orderBy: [{ nextOccurrence: 'asc' }, { createdAt: 'asc' }] }),
  ]);

  return { accounts, categories, transactions, budgets, bills, recurring };
}

export { PARTY_SELECT };
