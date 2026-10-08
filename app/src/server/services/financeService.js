import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, ErrorCodes } from '../../shared/errors.js';
import { fieldError, throwValidationError } from '../validators/shared.js';
import * as financeRepository from '../repositories/financeRepository.js';
import * as financePlanningService from './financePlanningService.js';
import { logFinanceEvent } from '../utils/audit.js';
import { Decimal, toAmount, percentOf } from '../utils/money.js';
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '../validators/finance.js';
import { toDateString } from '../utils/time.js';

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const MAX_ACCOUNTS = 50;
const TOP_CATEGORY_LIMIT = 5;

// Receipts live under app/uploads/finance/ (gitignored); the database stores
// metadata plus a server-generated stored name.
const uploadsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../uploads/finance',
);

// Type is decided by the file bytes, never by the client's header.
const RECEIPT_SIGNATURES = [
  {
    mime: 'image/jpeg',
    ext: '.jpg',
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    ext: '.png',
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: 'image/webp',
    ext: '.webp',
    test: (b) =>
      b.length > 12 &&
      b.toString('latin1', 0, 4) === 'RIFF' &&
      b.toString('latin1', 8, 12) === 'WEBP',
  },
  {
    mime: 'application/pdf',
    ext: '.pdf',
    test: (b) => b.length > 5 && b.toString('latin1', 0, 5) === '%PDF-',
  },
];

// Generated names are validated again before any path is built (defense in
// depth: a stored name never leaves [a-f0-9]{32} + known extension).
const STORED_NAME_PATTERN = /^[a-f0-9]{32}\.(jpg|png|webp|pdf)$/;

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

export function todayFor(user, now = new Date()) {
  return new Date(`${toDateString(now, user.timezone ?? 'UTC')}T00:00:00.000Z`);
}

function detectReceipt(buffer) {
  for (const signature of RECEIPT_SIGNATURES) {
    if (signature.test(buffer)) {
      return signature;
    }
  }
  return null;
}

// Display-only name: strip path segments, control characters and cap length.
// The physical file never uses this value.
function sanitizeOriginalName(rawName) {
  const base = typeof rawName === 'string' ? rawName.split(/[\\/]/).pop() : '';
  let cleaned = '';
  for (const ch of base) {
    const code = ch.codePointAt(0);
    if (code >= 32 && code !== 127 && code < 160) {
      cleaned += ch;
    }
  }
  cleaned = cleaned.trim().replace(/^\.+/, '');
  if (!cleaned) {
    return 'receipt';
  }
  return cleaned.slice(0, 120);
}

async function unlinkQuietly(storedName) {
  try {
    await fs.unlink(path.join(uploadsDir, storedName));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[finance] failed to remove receipt file ${storedName}: ${error.message}`);
    }
  }
}

// ---- Views ----

function balanceFor(account, movement) {
  const opening = account.openingBalance ?? new Decimal(0);
  if (!movement) {
    return opening;
  }
  return opening
    .plus(movement.income)
    .minus(movement.expense)
    .plus(movement.transferIn)
    .minus(movement.transferOut);
}

function toAccountView(account, movement) {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    openingBalance: toAmount(account.openingBalance),
    balance: toAmount(balanceFor(account, movement)),
    active: account.active,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function toCategoryView(category, householdId, usageCount) {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    icon: category.icon,
    scope: category.householdId === null ? 'GLOBAL' : 'HOUSEHOLD',
    active: category.active,
    sortOrder: category.sortOrder,
    ...(usageCount === undefined ? {} : { transactionCount: usageCount }),
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
    ...(category.householdId === null ? {} : { owned: category.householdId === householdId }),
  };
}

function receiptView(transactionId, receipt) {
  if (!receipt) {
    return null;
  }
  return {
    id: receipt.id,
    originalName: receipt.originalName,
    mimeType: receipt.mimeType,
    sizeBytes: receipt.sizeBytes,
    url: `/api/finance/transactions/${transactionId}/receipt`,
  };
}

function toTransactionView(transaction, { detail = false } = {}) {
  return {
    id: transaction.id,
    type: transaction.type,
    status: transaction.status,
    amount: toAmount(transaction.amount),
    currency: transaction.currency,
    category: transaction.category
      ? {
          id: transaction.category.id,
          name: transaction.category.name,
          type: transaction.category.type,
          icon: transaction.category.icon,
        }
      : null,
    account: transaction.account
      ? { id: transaction.account.id, name: transaction.account.name, type: transaction.account.type }
      : null,
    counterAccount: transaction.counterAccount
      ? {
          id: transaction.counterAccount.id,
          name: transaction.counterAccount.name,
          type: transaction.counterAccount.type,
        }
      : null,
    transactionDate: isoDate(transaction.transactionDate),
    description: transaction.description,
    merchant: transaction.merchant,
    notes: transaction.notes,
    sourceType: transaction.sourceType,
    sourceId: transaction.sourceId,
    recurringTransactionId: transaction.recurringTransactionId,
    hasReceipt: Boolean(transaction.receipt),
    ...(detail ? { receipt: receiptView(transaction.id, transaction.receipt) } : {}),
    voidedAt: transaction.voidedAt,
    voidReason: transaction.voidReason,
    createdBy: transaction.createdBy
      ? { id: transaction.createdBy.id, name: transaction.createdBy.name }
      : null,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  };
}

// ---- Meta ----

export async function listMeta({ user, householdId }) {
  await financePlanningService.ensureRecurringOccurrences({
    householdId,
    today: todayFor(user),
  });
  const [accounts, categories] = await Promise.all([
    financeRepository.listAccounts(householdId, { includeArchived: false, page: 1, limit: 100 }),
    financeRepository.listCategories(householdId, { includeArchived: false, page: 1, limit: 100 }),
  ]);
  const primary = await financeRepository.findFirstAccount(householdId);
  return {
    currencies: SUPPORTED_CURRENCIES,
    defaultCurrency: primary?.currency ?? DEFAULT_CURRENCY,
    today: isoDate(todayFor(user)),
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
    })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type,
      icon: category.icon,
      scope: category.householdId === null ? 'GLOBAL' : 'HOUSEHOLD',
    })),
  };
}

// ---- Accounts ----

export async function listAccounts({ householdId, query }) {
  const [total, accounts, movement] = await Promise.all([
    financeRepository.countAccounts(householdId, query),
    financeRepository.listAccounts(householdId, query),
    financeRepository.accountMovementByAccount(householdId),
  ]);
  return {
    items: accounts.map((account) => toAccountView(account, movement.get(account.id))),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getAccount({ householdId, id }) {
  const account = await financeRepository.findAccountById(id, householdId);
  if (!account) {
    throw notFound('Account not found.');
  }
  const movement = await financeRepository.accountMovementByAccount(householdId);
  return toAccountView(account, movement.get(account.id));
}

export async function createAccount({ user, householdId, data }) {
  const duplicate = await financeRepository.findAccountByNormalized(householdId, data.normalized);
  if (duplicate) {
    throw conflict('An account with this name already exists.', 'name');
  }
  const count = await financeRepository.countAccounts(householdId, { includeArchived: true });
  if (count >= MAX_ACCOUNTS) {
    throwValidationError([fieldError('name', `A household can have at most ${MAX_ACCOUNTS} accounts.`)]);
  }
  const account = await financeRepository.createAccount({
    householdId,
    createdById: user.id,
    ...data,
  });
  logFinanceEvent('account.created', { userId: user.id, householdId, accountId: account.id });
  return toAccountView(account, null);
}

export async function updateAccount({ user, householdId, id, patch }) {
  const account = await financeRepository.findAccountById(id, householdId);
  if (!account) {
    throw notFound('Account not found.');
  }
  if (patch.normalized && patch.normalized !== account.normalized) {
    const duplicate = await financeRepository.findAccountByNormalized(
      householdId,
      patch.normalized,
      id,
    );
    if (duplicate) {
      throw conflict('An account with this name already exists.', 'name');
    }
  }
  if (patch.currency && patch.currency !== account.currency) {
    const transactionCount = await financeRepository.countAccountTransactions(id);
    if (transactionCount > 0) {
      throw conflict(
        'This account already has transactions, so its currency cannot change.',
        'currency',
      );
    }
  }
  const updated = await financeRepository.updateAccount(id, householdId, patch);
  const movement = await financeRepository.accountMovementByAccount(householdId);
  return toAccountView(updated, movement.get(updated.id));
}

export async function archiveAccount({ user, householdId, id }) {
  const account = await financeRepository.findAccountById(id, householdId);
  if (!account) {
    throw notFound('Account not found.');
  }
  if (!account.active) {
    return toAccountView(account, null);
  }
  const updated = await financeRepository.updateAccount(id, householdId, { active: false });
  logFinanceEvent('account.archived', { userId: user.id, householdId, accountId: id });
  const movement = await financeRepository.accountMovementByAccount(householdId);
  return toAccountView(updated, movement.get(id));
}

// ---- Categories ----

export async function listCategories({ householdId, query }) {
  const [total, categories, usage] = await Promise.all([
    financeRepository.countCategories(householdId, query),
    financeRepository.listCategories(householdId, query),
    financeRepository.categoryUsageByHousehold(householdId),
  ]);
  return {
    items: categories.map((category) =>
      toCategoryView(category, householdId, usage.get(category.id) ?? 0),
    ),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function createCategory({ householdId, data }) {
  const duplicate = await financeRepository.findCategoryByNormalized(
    householdId,
    data.type,
    data.normalized,
  );
  if (duplicate) {
    throw conflict('A category with this name already exists.', 'name');
  }
  const category = await financeRepository.createCategory({ householdId, ...data });
  return toCategoryView(category, householdId, 0);
}

async function assertOwnedCategory(id, householdId) {
  const category = await financeRepository.findCategoryById(id);
  if (!category) {
    throw notFound('Category not found.');
  }
  if (category.householdId === null) {
    throw new AppError('Built-in categories cannot be changed.', {
      code: ErrorCodes.FORBIDDEN,
      status: 403,
    });
  }
  if (category.householdId !== householdId) {
    throw notFound('Category not found.');
  }
  return category;
}

export async function updateCategory({ householdId, id, patch }) {
  const category = await assertOwnedCategory(id, householdId);
  if (patch.normalized && patch.normalized !== category.normalized) {
    const duplicate = await financeRepository.findCategoryByNormalized(
      householdId,
      category.type,
      patch.normalized,
      id,
    );
    if (duplicate) {
      throw conflict('A category with this name already exists.', 'name');
    }
  }
  const updated = await financeRepository.updateCategory(id, householdId, patch);
  return toCategoryView(updated, householdId);
}

export async function archiveCategory({ householdId, id }) {
  const category = await assertOwnedCategory(id, householdId);
  if (!category.active) {
    return toCategoryView(category, householdId);
  }
  const updated = await financeRepository.updateCategory(id, householdId, { active: false });
  return toCategoryView(updated, householdId);
}

// ---- Transactions ----

export async function listTransactions({ user, householdId, query }) {
  await financePlanningService.ensureRecurringOccurrences({
    householdId,
    today: todayFor(user),
  });
  const where = financeRepository.buildTransactionWhere(householdId, query);
  const [total, transactions] = await Promise.all([
    financeRepository.countTransactions(where),
    financeRepository.listTransactions(where, query),
  ]);
  return {
    items: transactions.map((transaction) => toTransactionView(transaction)),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getTransaction({ householdId, id }) {
  const transaction = await financeRepository.findTransactionById(id, householdId);
  if (!transaction) {
    throw notFound('Transaction not found.');
  }
  return toTransactionView(transaction, { detail: true });
}

export async function createTransaction({ user, householdId, data }) {
  const account = data.accountId
    ? await financePlanningService.assertAccount(data.accountId, householdId)
    : null;
  const counterAccount = data.counterAccountId
    ? await financePlanningService.assertAccount(data.counterAccountId, householdId)
    : null;

  let category = null;
  if (data.type === 'TRANSFER') {
    if (!account || !counterAccount) {
      throwValidationError([
        fieldError('accountId', 'Transfers need a source and a destination account.'),
      ]);
    }
    if (account.id === counterAccount.id) {
      throwValidationError([fieldError('counterAccountId', 'Choose two different accounts.')]);
    }
    if (account.currency !== counterAccount.currency) {
      throwValidationError([
        fieldError('counterAccountId', 'Transfers need accounts in the same currency.'),
      ]);
    }
    if (data.categoryId) {
      throwValidationError([fieldError('categoryId', 'Transfers do not have a category.')]);
    }
  } else {
    if (data.counterAccountId) {
      throwValidationError([
        fieldError('counterAccountId', 'Only transfers have a destination account.'),
      ]);
    }
    if (!data.categoryId) {
      throwValidationError([fieldError('categoryId', 'Choose a category.')]);
    }
    category = await financePlanningService.assertCategory(
      data.categoryId,
      householdId,
      data.type,
    );
    if (account && account.currency !== data.currency) {
      throwValidationError([fieldError('accountId', `This account uses ${account.currency}.`)]);
    }
  }

  const currency = data.type === 'TRANSFER' ? account.currency : data.currency;
  const transaction = await financeRepository.createTransaction({
    householdId,
    createdById: user.id,
    type: data.type,
    status: 'POSTED',
    amount: data.amount,
    currency,
    categoryId: category?.id ?? null,
    accountId: account?.id ?? null,
    counterAccountId: counterAccount?.id ?? null,
    transactionDate: data.transactionDate,
    description: data.description,
    merchant: data.merchant,
    notes: data.notes,
    sourceType: 'MANUAL',
    sourceId: null,
    recurringTransactionId: null,
  });
  logFinanceEvent('transaction.created', {
    userId: user.id,
    householdId,
    transactionId: transaction.id,
    type: transaction.type,
    currency,
  });
  return toTransactionView(transaction, { detail: true });
}

export async function updateTransaction({ user, householdId, id, patch }) {
  const transaction = await financeRepository.findTransactionById(id, householdId);
  if (!transaction) {
    throw notFound('Transaction not found.');
  }
  if (transaction.status === 'VOIDED') {
    throw conflict('Voided transactions cannot be edited.');
  }
  if (patch.categoryId !== undefined) {
    if (transaction.type === 'TRANSFER') {
      throwValidationError([fieldError('categoryId', 'Transfers do not have a category.')]);
    }
    if (!patch.categoryId) {
      throwValidationError([fieldError('categoryId', 'Choose a category.')]);
    }
    await financePlanningService.assertCategory(patch.categoryId, householdId, transaction.type);
  }
  const updated = await financeRepository.updateTransaction(id, householdId, patch);
  logFinanceEvent('transaction.updated', {
    userId: user.id,
    householdId,
    transactionId: id,
    fields: Object.keys(patch),
  });
  return toTransactionView(updated, { detail: true });
}

export async function voidTransaction({ user, householdId, id, reason }) {
  const transaction = await financeRepository.findTransactionById(id, householdId);
  if (!transaction) {
    throw notFound('Transaction not found.');
  }
  if (transaction.status === 'VOIDED') {
    throw conflict('This transaction is already voided.');
  }
  const voided = await financeRepository.voidTransactionAtomically({
    id,
    householdId,
    transaction,
    voidedById: user.id,
    voidReason: reason,
  });
  logFinanceEvent('transaction.voided', {
    userId: user.id,
    householdId,
    transactionId: id,
    type: transaction.type,
  });
  return toTransactionView(voided, { detail: true });
}

// ---- Receipts ----

export async function addReceipt({ user, householdId, transactionId, buffer, originalName }) {
  const transaction = await financeRepository.findTransactionById(transactionId, householdId);
  if (!transaction) {
    throw notFound('Transaction not found.');
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError('Attach a valid receipt file.', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
      details: [fieldError('file', 'Attach a valid receipt file.')],
    });
  }
  if (buffer.length > MAX_RECEIPT_BYTES) {
    throw new AppError('Receipts must be 5MB or smaller.', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 413,
      details: [fieldError('file', 'Receipts must be 5MB or smaller.')],
    });
  }
  const signature = detectReceipt(buffer);
  if (!signature) {
    throw new AppError('Only JPEG, PNG, WebP and PDF receipts are allowed.', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
      details: [fieldError('file', 'Only JPEG, PNG, WebP and PDF receipts are allowed.')],
    });
  }
  const existing = await financeRepository.findReceiptByTransaction(transactionId);
  if (existing) {
    throw conflict('This transaction already has a receipt.');
  }

  const storedName = `${randomBytes(16).toString('hex')}${signature.ext}`;
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, storedName), buffer, { flag: 'wx' });

  try {
    const receipt = await financeRepository.createReceipt(transactionId, {
      originalName: sanitizeOriginalName(originalName),
      storedName,
      mimeType: signature.mime,
      sizeBytes: buffer.length,
    });
    logFinanceEvent('receipt.added', {
      userId: user.id,
      householdId,
      transactionId,
      receiptId: receipt.id,
      mimeType: receipt.mimeType,
      sizeBytes: receipt.sizeBytes,
    });
    return { ...receiptView(transactionId, receipt), transactionId };
  } catch (error) {
    await unlinkQuietly(storedName);
    throw error;
  }
}

// Returns file details for the controller to stream; never exposes the
// physical path outside this module.
export async function getReceipt({ householdId, transactionId }) {
  const transaction = await financeRepository.findTransactionById(transactionId, householdId);
  if (!transaction) {
    throw notFound('Transaction not found.');
  }
  const receipt = await financeRepository.findReceiptByTransaction(transactionId);
  if (!receipt || !STORED_NAME_PATTERN.test(receipt.storedName)) {
    throw notFound('Receipt not found.');
  }
  const filePath = path.join(uploadsDir, receipt.storedName);
  try {
    await fs.access(filePath);
  } catch {
    throw notFound('Receipt not found.');
  }
  return {
    filePath,
    mimeType: receipt.mimeType,
    originalName: receipt.originalName,
    sizeBytes: receipt.sizeBytes,
  };
}

export async function deleteReceipt({ user, householdId, transactionId }) {
  const transaction = await financeRepository.findTransactionById(transactionId, householdId);
  if (!transaction) {
    throw notFound('Transaction not found.');
  }
  const receipt = await financeRepository.findReceiptByTransaction(transactionId);
  if (!receipt) {
    throw notFound('Receipt not found.');
  }
  await financeRepository.deleteReceipt(receipt.id);
  await unlinkQuietly(receipt.storedName);
  logFinanceEvent('receipt.deleted', {
    userId: user.id,
    householdId,
    transactionId,
    receiptId: receipt.id,
  });
  return { id: receipt.id, deleted: true };
}

// ---- Reports ----

function monthWindowFrom(year, month) {
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  };
}

async function resolveReportScope({ user, householdId, query }) {
  const today = todayFor(user);
  const year = query.year ?? today.getUTCFullYear();
  const month = query.month ?? today.getUTCMonth() + 1;
  const { from, to } = monthWindowFrom(year, month);

  const [accountCurrencies, activityCurrencies, primary] = await Promise.all([
    financeRepository.householdCurrencies(householdId),
    financeRepository.transactionActivityCurrencies(householdId, from, to),
    financeRepository.findFirstAccount(householdId),
  ]);
  const availableCurrencies = [
    ...new Set([
      ...accountCurrencies.map((row) => row.currency),
      ...activityCurrencies.map((row) => row.currency),
    ]),
  ].sort();
  const currency =
    query.currency ?? primary?.currency ?? availableCurrencies[0] ?? DEFAULT_CURRENCY;
  return { year, month, from, to, currency, availableCurrencies };
}

function categoryBreakdown(rows, categoriesById, total) {
  return rows
    .map((row) => ({
      categoryId: row.categoryId,
      name: categoriesById.get(row.categoryId)?.name ?? null,
      icon: categoriesById.get(row.categoryId)?.icon ?? null,
      total: toAmount(row._sum.amount),
      count: row._count._all,
      percent: percentOf(row._sum.amount, total),
    }))
    .sort((a, b) => new Decimal(b.total).comparedTo(new Decimal(a.total)))
    .map((row, index, all) => ({ ...row, rank: index + 1, of: all.length }));
}

export async function getMonthlyReport({ user, householdId, query }) {
  await financePlanningService.ensureRecurringOccurrences({
    householdId,
    today: todayFor(user),
  });
  const scope = await resolveReportScope({ user, householdId, query });
  const { year, month, from, to, currency } = scope;

  const postedWindow = {
    householdId,
    status: 'POSTED',
    currency,
    transactionDate: { gte: from, lt: to },
  };

  const [totals, expenseRows, incomeRows, budgetProgress, billSummary, upcomingBills] =
    await Promise.all([
      financeRepository.totalsByType({ ...postedWindow, type: { in: ['INCOME', 'EXPENSE'] } }),
      financeRepository.totalsByCategory({ ...postedWindow, type: 'EXPENSE' }),
      financeRepository.totalsByCategory({ ...postedWindow, type: 'INCOME' }),
      financePlanningService.getBudgetProgress({ householdId, year, month, currency }),
      financePlanningService.getBillSummary({ user, householdId }),
      financePlanningService.listUpcomingBills({ user, householdId, limit: 5 }),
    ]);

  const sumFor = (type) => {
    const row = totals.find((entry) => entry.type === type);
    return { amount: row?._sum.amount ?? 0, count: row?._count._all ?? 0 };
  };
  const income = sumFor('INCOME');
  const expenses = sumFor('EXPENSE');
  const net = new Decimal(toAmount(income.amount)).minus(new Decimal(toAmount(expenses.amount)));

  const categoryIds = [
    ...new Set([
      ...expenseRows.map((row) => row.categoryId),
      ...incomeRows.map((row) => row.categoryId),
    ].filter(Boolean)),
  ];
  const categories = await financeRepository.listCategoriesByIds(categoryIds);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  const expenseByCategory = categoryBreakdown(expenseRows, categoriesById, expenses.amount);
  const incomeByCategory = categoryBreakdown(incomeRows, categoriesById, income.amount);
  const accountMovement = await financeRepository.accountMovementByAccount(householdId);
  const accounts = (await financeRepository.listAccounts(householdId, {
    includeArchived: true,
    page: 1,
    limit: 100,
  }))
    .filter((account) => account.currency === currency)
    .map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      active: account.active,
      balance: toAmount(balanceFor(account, accountMovement.get(account.id))),
    }));

  return {
    year,
    month,
    currency,
    availableCurrencies: scope.availableCurrencies,
    income: toAmount(income.amount),
    expenses: toAmount(expenses.amount),
    net: toAmount(net),
    transactionCount: income.count + expenses.count,
    expenseByCategory,
    incomeByCategory,
    topExpenseCategories: expenseByCategory.slice(0, TOP_CATEGORY_LIMIT),
    budgets: budgetProgress.items,
    budgetTotals: {
      amount: budgetProgress.totalAmount,
      spent: budgetProgress.totalSpent,
      percentUsed: budgetProgress.percentUsed,
    },
    bills: billSummary,
    upcomingBills,
    accounts,
    generatedAt: new Date().toISOString(),
  };
}

// ---- Dashboard ----

export async function getDashboardFinance({ user, householdId }) {
  const today = todayFor(user);
  await financePlanningService.ensureRecurringOccurrences({ householdId, today });
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const { from, to } = monthWindowFrom(year, month);

  const primary = await financeRepository.findFirstAccount(householdId);
  const currency = primary?.currency ?? DEFAULT_CURRENCY;

  const [totals, budgetProgress, billSummary, upcomingBills, accountCount, transactionCount] =
    await Promise.all([
      financeRepository.totalsByType({
        householdId,
        status: 'POSTED',
        currency,
        type: { in: ['INCOME', 'EXPENSE'] },
        transactionDate: { gte: from, lt: to },
      }),
      financePlanningService.getBudgetProgress({ householdId, year, month, currency }),
      financePlanningService.getBillSummary({ user, householdId }),
      financePlanningService.listUpcomingBills({ user, householdId, limit: 3 }),
      financeRepository.countAccounts(householdId, { includeArchived: false }),
      financeRepository.countHouseholdTransactions(householdId),
    ]);

  const sumFor = (type) => totals.find((row) => row.type === type)?._sum.amount ?? 0;
  const income = new Decimal(toAmount(sumFor('INCOME')));
  const expenses = new Decimal(toAmount(sumFor('EXPENSE')));
  const hasData =
    accountCount > 0 ||
    transactionCount > 0 ||
    budgetProgress.items.length > 0 ||
    billSummary.upcoming + billSummary.paid + billSummary.overdue > 0;

  return {
    status: hasData ? 'available' : 'empty',
    currency,
    year,
    month,
    income: income.toFixed(2),
    expenses: expenses.toFixed(2),
    net: income.minus(expenses).toFixed(2),
    budgets: {
      count: budgetProgress.items.length,
      amount: budgetProgress.totalAmount,
      spent: budgetProgress.totalSpent,
      percentUsed: budgetProgress.percentUsed,
    },
    overdueBillCount: billSummary.overdue,
    upcomingBills,
  };
}
