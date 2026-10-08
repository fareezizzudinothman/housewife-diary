import { AppError, ErrorCodes } from '../../shared/errors.js';
import { fieldError, throwValidationError } from '../validators/shared.js';
import * as financeRepository from '../repositories/financeRepository.js';
import { logFinanceEvent } from '../utils/audit.js';
import { toDecimal, toAmount, percentOf, Decimal } from '../utils/money.js';
import { DAY_MS, occurrenceDates } from '../utils/recurrence.js';
import { startOfDayFromString, toDateString } from '../utils/time.js';

// Budgets, bills and recurring transactions. This service never imports
// financeService (no cycle): compound financial writes live in the repository
// transactions (payBillAtomically, voidTransactionAtomically).

const MAX_OCCURRENCES_PER_RUN = 60;
const CURSOR_SEARCH_HORIZON_DAYS = 120 * 366;

function notFound(message = 'Finance record not found.') {
  return new AppError(message, { code: ErrorCodes.NOT_FOUND, status: 404 });
}

function conflict(message, field) {
  return new AppError(message, {
    code: ErrorCodes.CONFLICT,
    status: 409,
    details: field ? [fieldError(field, message)] : [],
  });
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function monthWindow(year, month) {
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  };
}

export function todayFor(user, now = new Date()) {
  return new Date(`${toDateString(now, user.timezone ?? 'UTC')}T00:00:00.000Z`);
}

// ---- Shared assertions ----

export async function assertAccount(accountId, householdId) {
  if (!accountId) {
    return null;
  }
  const account = await financeRepository.findAccountById(accountId, householdId);
  if (!account) {
    throwValidationError([fieldError('accountId', 'Choose an account from the list.')]);
  }
  return account;
}

// Categories are global (householdId null) or household-owned.
export async function assertCategory(categoryId, householdId, type, field = 'categoryId') {
  const category = await financeRepository.findCategoryById(categoryId);
  if (!category || (category.householdId && category.householdId !== householdId)) {
    throwValidationError([fieldError(field, 'Choose a category from the list.')]);
  }
  if (type && category.type !== type) {
    throwValidationError([fieldError(field, `Choose an ${type === 'INCOME' ? 'income' : 'expense'} category.`)]);
  }
  return category;
}

// ---- Bills ----

export function deriveBillStatus(bill, today) {
  if (bill.status === 'PAID') {
    return 'PAID';
  }
  if (bill.status === 'CANCELLED') {
    return 'CANCELLED';
  }
  const due = bill.dueDate.getTime();
  if (due < today.getTime()) {
    return 'OVERDUE';
  }
  if (due === today.getTime()) {
    return 'DUE';
  }
  return 'UPCOMING';
}

function toBillView(bill, today) {
  return {
    id: bill.id,
    name: bill.name,
    amount: toAmount(bill.amount),
    currency: bill.currency,
    dueDate: isoDate(bill.dueDate),
    category: bill.category
      ? { id: bill.category.id, name: bill.category.name, icon: bill.category.icon }
      : null,
    account: bill.account
      ? { id: bill.account.id, name: bill.account.name, type: bill.account.type }
      : null,
    status: deriveBillStatus(bill, today),
    storedStatus: bill.status,
    recurring: bill.recurring,
    notes: bill.notes,
    paidAt: bill.paidAt,
    paidTransactionId: bill.paidTransactionId,
    cancelledAt: bill.cancelledAt,
    createdAt: bill.createdAt,
    updatedAt: bill.updatedAt,
  };
}

// Unpaid bills surface on the calendar as all-day derived items (sourceType
// BILL) on their due date; paid and cancelled bills never appear.
export function toBillEventView(bill, timezone) {
  const dateString = isoDate(bill.dueDate);
  const startAt = new Date(startOfDayFromString(dateString, timezone));
  const today = new Date(`${toDateString(new Date(), timezone)}T00:00:00.000Z`);
  return {
    id: `bill:${bill.id}`,
    sourceType: 'BILL',
    sourceId: bill.id,
    title: bill.name,
    description: bill.notes,
    location: null,
    startAt: startAt.toISOString(),
    endAt: startAt.toISOString(),
    allDay: true,
    category: null,
    reminder: null,
    recurrence: null,
    recurring: false,
    bill: {
      id: bill.id,
      amount: toAmount(bill.amount),
      currency: bill.currency,
      dueDate: dateString,
      status: deriveBillStatus(bill, today),
      category: bill.category
        ? { id: bill.category.id, name: bill.category.name, icon: bill.category.icon }
        : null,
    },
    createdBy: null,
    createdAt: bill.createdAt,
    updatedAt: bill.updatedAt,
  };
}

export async function listBills({ user, householdId, query }) {
  const today = todayFor(user);
  const where = financeRepository.buildBillWhere(householdId, query, { today });
  const [total, bills] = await Promise.all([
    financeRepository.countBills(where),
    financeRepository.listBills(where, query),
  ]);
  return {
    items: bills.map((bill) => toBillView(bill, today)),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getBill({ user, householdId, id }) {
  const bill = await financeRepository.findBillById(id, householdId);
  if (!bill) {
    throw notFound('Bill not found.');
  }
  return toBillView(bill, todayFor(user));
}

export async function createBill({ user, householdId, data }) {
  await assertCategory(data.categoryId, householdId, 'EXPENSE');
  const account = await assertAccount(data.accountId, householdId);
  if (account && account.currency !== data.currency) {
    throwValidationError([
      fieldError('accountId', `This account uses ${account.currency}.`),
    ]);
  }
  const bill = await financeRepository.createBill({
    ...data,
    householdId,
    createdById: user.id,
  });
  return toBillView(bill, todayFor(user));
}

export async function updateBill({ user, householdId, id, patch }) {
  const bill = await financeRepository.findBillById(id, householdId);
  if (!bill) {
    throw notFound('Bill not found.');
  }
  if (bill.status !== 'UPCOMING') {
    throw conflict('Paid or cancelled bills cannot be edited.');
  }
  if (patch.categoryId !== undefined) {
    await assertCategory(patch.categoryId, householdId, 'EXPENSE');
  }
  if (patch.accountId) {
    const account = await assertAccount(patch.accountId, householdId);
    const currency = patch.currency ?? bill.currency;
    if (account && account.currency !== currency) {
      throwValidationError([fieldError('accountId', `This account uses ${account.currency}.`)]);
    }
  }
  const updated = await financeRepository.updateBill(id, householdId, patch);
  return toBillView(updated, todayFor(user));
}

// Cash-basis settlement: paying creates the linked expense. A bill is never
// an expense by itself.
export async function payBill({ user, householdId, id, data }) {
  const bill = await financeRepository.findBillById(id, householdId);
  if (!bill) {
    throw notFound('Bill not found.');
  }
  if (bill.status !== 'UPCOMING') {
    throw conflict(
      bill.status === 'PAID' ? 'This bill is already paid.' : 'This bill was cancelled.',
    );
  }

  const accountId = data.accountId === undefined ? bill.accountId : data.accountId;
  const account = await assertAccount(accountId, householdId);
  if (account && account.currency !== bill.currency) {
    throwValidationError([fieldError('accountId', `This account uses ${account.currency}.`)]);
  }

  const paidAt = new Date();
  const transactionDate = data.transactionDate ?? todayFor(user, paidAt);
  const transactionData = {
    householdId,
    createdById: user.id,
    type: 'EXPENSE',
    status: 'POSTED',
    amount: data.amount ?? toAmount(bill.amount),
    currency: bill.currency,
    categoryId: bill.categoryId,
    accountId: account?.id ?? null,
    counterAccountId: null,
    transactionDate,
    description: data.description ?? bill.name,
    merchant: data.merchant ?? null,
    notes: data.notes ?? null,
    sourceType: 'BILL',
    sourceId: bill.id,
    recurringTransactionId: null,
  };

  const transaction = await financeRepository.payBillAtomically({
    billId: bill.id,
    householdId,
    transactionData,
    paidAt,
  });
  if (!transaction) {
    throw conflict('This bill is already paid.');
  }
  logFinanceEvent('bill.paid', {
    userId: user.id,
    householdId,
    billId: bill.id,
    transactionId: transaction.id,
    amount: toAmount(transaction.amount),
    currency: transaction.currency,
  });

  const refreshed = await financeRepository.findBillById(id, householdId);
  return {
    bill: toBillView(refreshed, todayFor(user, paidAt)),
    transaction: {
      id: transaction.id,
      type: transaction.type,
      amount: toAmount(transaction.amount),
      currency: transaction.currency,
      transactionDate: isoDate(transaction.transactionDate),
    },
  };
}

export async function cancelBill({ user, householdId, id }) {
  const bill = await financeRepository.findBillById(id, householdId);
  if (!bill) {
    throw notFound('Bill not found.');
  }
  if (bill.status === 'PAID') {
    throw conflict('Paid bills cannot be cancelled. Void the payment instead.');
  }
  if (bill.status === 'CANCELLED') {
    throw conflict('This bill is already cancelled.');
  }
  const result = await financeRepository.cancelBill(id, householdId);
  if (result.count === 0) {
    throw conflict('This bill could not be cancelled.');
  }
  logFinanceEvent('bill.cancelled', { userId: user.id, householdId, billId: id });
  const refreshed = await financeRepository.findBillById(id, householdId);
  return toBillView(refreshed, todayFor(user));
}

export async function getBillSummary({ user, householdId }) {
  const today = todayFor(user);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  const [dueInMonth, overdue, paid, upcoming] = await Promise.all([
    financeRepository.countBillsDueBetween(householdId, monthStart, monthEnd),
    financeRepository.countOverdueBills(householdId, today),
    financeRepository.countBills({ householdId, status: 'PAID' }),
    financeRepository.countBills({ householdId, status: 'UPCOMING' }),
  ]);
  return { dueInMonth, overdue, paid, upcoming };
}

export async function listUpcomingBills({ user, householdId, limit = 3 }) {
  const today = todayFor(user);
  const bills = await financeRepository.listUpcomingBills(householdId, today, limit);
  return bills.map((bill) => ({
    id: bill.id,
    name: bill.name,
    amount: toAmount(bill.amount),
    currency: bill.currency,
    dueDate: isoDate(bill.dueDate),
    status: deriveBillStatus(bill, today),
    category: bill.category ? { id: bill.category.id, name: bill.category.name } : null,
  }));
}

// ---- Budgets ----

function toBudgetView(budget, spent) {
  const amount = toDecimal(budget.amount);
  const spentDecimal = toDecimal(spent) ?? new Decimal(0);
  return {
    id: budget.id,
    category: budget.category
      ? { id: budget.category.id, name: budget.category.name, icon: budget.category.icon }
      : null,
    period: budget.period,
    amount: toAmount(amount),
    currency: budget.currency,
    year: budget.year,
    month: budget.month,
    notes: budget.notes,
    spent: toAmount(spentDecimal),
    remaining: toAmount(amount.minus(spentDecimal)),
    percentUsed: percentOf(spentDecimal, amount),
    overBudget: spentDecimal.gt(amount),
    createdAt: budget.createdAt,
    updatedAt: budget.updatedAt,
  };
}

// One spend query per (year, month, currency) group covering all budgets.
async function spendForBudgets(householdId, budgets) {
  const spendByKey = new Map();
  const grouped = new Map();
  for (const budget of budgets) {
    const key = `${budget.year}-${budget.month}-${budget.currency}`;
    if (!grouped.has(key)) {
      grouped.set(key, { year: budget.year, month: budget.month, currency: budget.currency, categoryIds: [] });
    }
    grouped.get(key).categoryIds.push(budget.categoryId);
  }

  for (const group of grouped.values()) {
    const { from, to } = monthWindow(group.year, group.month);
    const rows = await financeRepository.budgetSpendByCategory(householdId, {
      from,
      to,
      currency: group.currency,
      categoryIds: group.categoryIds,
    });
    for (const row of rows) {
      spendByKey.set(`${group.year}-${group.month}-${group.currency}-${row.categoryId}`, row._sum.amount ?? 0);
    }
  }
  return spendByKey;
}

export async function listBudgets({ householdId, query }) {
  const [total, budgets] = await Promise.all([
    financeRepository.countBudgets(householdId, query),
    financeRepository.listBudgets(householdId, query),
  ]);
  const spend = await spendForBudgets(householdId, budgets);
  return {
    items: budgets.map((budget) =>
      toBudgetView(
        budget,
        spend.get(`${budget.year}-${budget.month}-${budget.currency}-${budget.categoryId}`) ?? 0,
      ),
    ),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getBudget({ householdId, id }) {
  const budget = await financeRepository.findBudgetById(id, householdId);
  if (!budget) {
    throw notFound('Budget not found.');
  }
  const spend = await spendForBudgets(householdId, [budget]);
  return toBudgetView(budget, spend.get(`${budget.year}-${budget.month}-${budget.currency}-${budget.categoryId}`) ?? 0);
}

export async function createBudget({ user, householdId, data }) {
  await assertCategory(data.categoryId, householdId, 'EXPENSE');
  let budget;
  try {
    budget = await financeRepository.createBudget({
      householdId,
      createdById: user.id,
      ...data,
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw conflict('A budget for this category and month already exists.', 'categoryId');
    }
    throw error;
  }
  const spend = await spendForBudgets(householdId, [budget]);
  return toBudgetView(
    budget,
    spend.get(`${budget.year}-${budget.month}-${budget.currency}-${budget.categoryId}`) ?? 0,
  );
}

export async function updateBudget({ householdId, id, patch }) {
  const budget = await financeRepository.findBudgetById(id, householdId);
  if (!budget) {
    throw notFound('Budget not found.');
  }
  const updated = await financeRepository.updateBudget(id, householdId, patch);
  const spend = await spendForBudgets(householdId, [updated]);
  return toBudgetView(updated, spend.get(`${updated.year}-${updated.month}-${updated.currency}-${updated.categoryId}`) ?? 0);
}

export async function deleteBudget({ householdId, id }) {
  const budget = await financeRepository.findBudgetById(id, householdId);
  if (!budget) {
    throw notFound('Budget not found.');
  }
  await financeRepository.deleteBudget(id, householdId);
  return { id, deleted: true };
}

// Shared by the monthly report and the dashboard.
export async function getBudgetProgress({ householdId, year, month, currency }) {
  const query = { page: 1, limit: 100, year, month };
  const budgets = await financeRepository.listBudgets(householdId, query);
  const scoped = budgets.filter((budget) => budget.currency === currency);
  const spend = await spendForBudgets(householdId, scoped);
  const items = scoped.map((budget) =>
    toBudgetView(budget, spend.get(`${budget.year}-${budget.month}-${budget.currency}-${budget.categoryId}`) ?? 0),
  );
  const totalAmount = items.reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const totalSpent = items.reduce((sum, item) => sum.plus(item.spent), new Decimal(0));
  return {
    items,
    totalAmount: toAmount(totalAmount),
    totalSpent: toAmount(totalSpent),
    percentUsed: percentOf(totalSpent, totalAmount),
  };
}

// ---- Recurring transactions ----

function recurringRuleJson(rule) {
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    ...(rule.endDate ? { endDate: isoDate(rule.endDate) } : {}),
  };
}

function toRecurringView(rule) {
  return {
    id: rule.id,
    type: rule.type,
    amount: toAmount(rule.amount),
    currency: rule.currency,
    category: rule.category
      ? { id: rule.category.id, name: rule.category.name, icon: rule.category.icon }
      : null,
    account: rule.account
      ? { id: rule.account.id, name: rule.account.name, type: rule.account.type }
      : null,
    description: rule.description,
    merchant: rule.merchant,
    notes: rule.notes,
    frequency: rule.frequency,
    interval: rule.interval,
    startDate: isoDate(rule.startDate),
    endDate: rule.endDate ? isoDate(rule.endDate) : null,
    nextOccurrence: rule.nextOccurrence ? isoDate(rule.nextOccurrence) : null,
    active: rule.active,
    generatedCount: rule._count?.transactions ?? 0,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

export async function listRecurring({ householdId, query }) {
  const [total, rules] = await Promise.all([
    financeRepository.countRecurring(householdId, query),
    financeRepository.listRecurring(householdId, query),
  ]);
  return {
    items: rules.map(toRecurringView),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getRecurring({ householdId, id }) {
  const rule = await financeRepository.findRecurringById(id, householdId);
  if (!rule) {
    throw notFound('Recurring transaction not found.');
  }
  return toRecurringView(rule);
}

export async function createRecurring({ user, householdId, data }) {
  await assertCategory(data.categoryId, householdId, data.type);
  const account = await assertAccount(data.accountId, householdId);
  if (account && account.currency !== data.currency) {
    throwValidationError([fieldError('accountId', `This account uses ${account.currency}.`)]);
  }
  const rule = await financeRepository.createRecurring({
    householdId,
    createdById: user.id,
    ...data,
    nextOccurrence: data.startDate,
  });
  return toRecurringView(rule);
}

export async function updateRecurring({ user, householdId, id, patch }) {
  const rule = await financeRepository.findRecurringById(id, householdId);
  if (!rule) {
    throw notFound('Recurring transaction not found.');
  }
  if (patch.categoryId !== undefined) {
    await assertCategory(patch.categoryId, householdId, rule.type);
  }
  if (patch.accountId) {
    const account = await assertAccount(patch.accountId, householdId);
    if (account && account.currency !== rule.currency) {
      throwValidationError([fieldError('accountId', `This account uses ${account.currency}.`)]);
    }
  }
  const endDate = patch.endDate !== undefined ? patch.endDate : rule.endDate;
  if (endDate && endDate < rule.startDate) {
    throwValidationError([fieldError('endDate', 'End date must be on or after the start date.')]);
  }
  const updated = await financeRepository.updateRecurring(id, householdId, patch);
  return toRecurringView(updated);
}

export async function setRecurringPaused({ householdId, id, active }) {
  const rule = await financeRepository.findRecurringById(id, householdId);
  if (!rule) {
    throw notFound('Recurring transaction not found.');
  }
  const updated = await financeRepository.setRecurringActive(id, householdId, active);
  return toRecurringView(updated);
}

// The next occurrence strictly after `anchor`, or null when the series is
// exhausted (rule end date passed).
async function nextCursor(rule, anchor) {
  const searchFrom = new Date(anchor.getTime() + DAY_MS);
  const far = new Date(searchFrom.getTime() + CURSOR_SEARCH_HORIZON_DAYS * DAY_MS);
  const dates = occurrenceDates(recurringRuleJson(rule), {
    start: rule.startDate,
    from: searchFrom,
    to: far,
    limit: 1,
  });
  return dates[0] ?? null;
}

async function materializeRule(rule, today) {
  const from = rule.nextOccurrence;
  const dates = occurrenceDates(recurringRuleJson(rule), {
    start: rule.startDate,
    from,
    to: today,
    limit: MAX_OCCURRENCES_PER_RUN,
  });

  if (dates.length) {
    await financeRepository.createRecurringTransactions(
      dates.map((transactionDate) => ({
        householdId: rule.householdId,
        createdById: rule.createdById,
        type: rule.type,
        status: 'POSTED',
        amount: rule.amount,
        currency: rule.currency,
        categoryId: rule.categoryId,
        accountId: rule.accountId,
        counterAccountId: null,
        transactionDate,
        description: rule.description,
        merchant: rule.merchant,
        notes: rule.notes,
        sourceType: 'RECURRING',
        sourceId: rule.id,
        recurringTransactionId: rule.id,
      })),
    );
  }

  const anchor = dates.length ? dates[dates.length - 1] : from;
  const baseline = new Date(Math.max(anchor.getTime(), today.getTime()));
  const next = await nextCursor(rule, baseline);
  if ((next?.getTime() ?? null) !== from.getTime()) {
    await financeRepository.advanceRecurringCursor(rule.id, rule.householdId, next);
  }
  return dates.length;
}

// Bounded catch-up: generate all occurrences that have come due up to today.
// Called on finance reads so the ledger reflects actual cash-basis history
// without materializing unbounded future rows.
export async function ensureRecurringOccurrences({ householdId, today }) {
  const rules = await financeRepository.listDueRecurring(householdId, today);
  let created = 0;
  for (const rule of rules) {
    try {
      created += await materializeRule(rule, today);
    } catch (error) {
      console.error(`[finance] failed to materialize recurring rule ${rule.id}: ${error.message}`);
    }
  }
  return created;
}
