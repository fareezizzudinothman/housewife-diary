import { fieldError, throwValidationError } from './shared.js';
import {
  ACCOUNT_TYPES,
  BILL_STATUS_FILTERS,
  BUDGET_PERIODS,
  CATEGORY_TYPES,
  DEFAULT_CURRENCY,
  MAX_ACCOUNT_NAME,
  MAX_BILL_NAME,
  MAX_CATEGORY_NAME,
  MAX_DESCRIPTION,
  MAX_MERCHANT,
  MAX_NOTES,
  MAX_SEARCH,
  MAX_VOID_REASON,
  RECURRENCE_FREQUENCIES,
  SOURCE_TYPES,
  TRANSACTION_STATUS_FILTERS,
  TRANSACTION_TYPES,
  trimOptionalLine,
  validateBoolean,
  validateBooleanQuery,
  validateCurrency,
  validateDateValue,
  validateEnum,
  validateIcon,
  validateInterval,
  validateMoney,
  validateMonth,
  validateOptionalId,
  validateOptionalText,
  validatePageParams,
  validateYear,
} from './finance.js';

const MAX_BUDGET_NOTES = 500;

function requireAtLeastOneField(patch, errors) {
  if (!Object.keys(patch).length) {
    errors.push(fieldError('body', 'Provide at least one field to update.'));
  }
}

function rejectImmutableFields(input, fields, errors) {
  for (const [field, message] of Object.entries(fields)) {
    if (input?.[field] !== undefined) {
      errors.push(fieldError(field, message));
    }
  }
}

// ---- Accounts ----

export function validateCreateAccount(input) {
  const errors = [];
  const name = trimOptionalLine(input?.name, 'name', MAX_ACCOUNT_NAME, errors);
  if (!name) {
    errors.push(fieldError('name', `Name must be 1-${MAX_ACCOUNT_NAME} characters.`));
  }
  const type = validateEnum(input?.type, ACCOUNT_TYPES, 'type', errors);
  const currency = validateCurrency(input?.currency, 'currency', errors, {
    fallback: DEFAULT_CURRENCY,
  });
  const openingBalance = validateMoney(input?.openingBalance, 'openingBalance', errors, {
    required: false,
    allowNegative: true,
  });
  if (errors.length) {
    throwValidationError(errors);
  }
  return {
    name,
    normalized: name.toLowerCase(),
    type: type.value ?? 'CASH',
    currency: currency ?? DEFAULT_CURRENCY,
    openingBalance: openingBalance === undefined ? '0.00' : openingBalance,
  };
}

export function validateUpdateAccount(input) {
  const errors = [];
  const patch = {};

  if (input?.name !== undefined) {
    const name = trimOptionalLine(input.name, 'name', MAX_ACCOUNT_NAME, errors);
    if (!name) {
      errors.push(fieldError('name', `Name must be 1-${MAX_ACCOUNT_NAME} characters.`));
    } else {
      patch.name = name;
      patch.normalized = name.toLowerCase();
    }
  }
  if (input?.type !== undefined) {
    const type = validateEnum(input.type, ACCOUNT_TYPES, 'type', errors, { required: true });
    if (type.value) {
      patch.type = type.value;
    }
  }
  if (input?.currency !== undefined) {
    patch.currency = validateCurrency(input.currency, 'currency', errors, { required: true });
  }
  if (input?.openingBalance !== undefined) {
    patch.openingBalance = validateMoney(input.openingBalance, 'openingBalance', errors, {
      required: true,
      allowNegative: true,
    });
  }
  if (input?.active !== undefined) {
    const active = validateBoolean(input.active, 'active', errors);
    if (active.provided) {
      patch.active = active.value;
    }
  }

  requireAtLeastOneField(patch, errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return patch;
}

export function validateAccountQuery(input) {
  const errors = [];
  const query = validatePageParams(input, errors);
  const includeArchived = validateBooleanQuery(input?.includeArchived, 'includeArchived', errors);
  if (includeArchived.provided) {
    query.includeArchived = includeArchived.value === true;
  } else {
    query.includeArchived = false;
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return query;
}

// ---- Categories ----

export function validateCreateCategory(input) {
  const errors = [];
  const name = trimOptionalLine(input?.name, 'name', MAX_CATEGORY_NAME, errors);
  if (!name) {
    errors.push(fieldError('name', `Name must be 1-${MAX_CATEGORY_NAME} characters.`));
  }
  const type = validateEnum(input?.type, CATEGORY_TYPES, 'type', errors, { required: true });
  const icon = validateIcon(input?.icon, errors);
  const sortOrder = input?.sortOrder === undefined || input?.sortOrder === null
    ? 0
    : Number(input.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    errors.push(fieldError('sortOrder', 'Sort order must be between 0 and 9999.'));
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return {
    name,
    normalized: name.toLowerCase(),
    type: type.value,
    icon: icon ?? null,
    sortOrder,
  };
}

export function validateUpdateCategory(input) {
  const errors = [];
  const patch = {};

  if (input?.name !== undefined) {
    const name = trimOptionalLine(input.name, 'name', MAX_CATEGORY_NAME, errors);
    if (!name) {
      errors.push(fieldError('name', `Name must be 1-${MAX_CATEGORY_NAME} characters.`));
    } else {
      patch.name = name;
      patch.normalized = name.toLowerCase();
    }
  }
  if (input?.icon !== undefined) {
    patch.icon = validateIcon(input.icon, errors) ?? null;
  }
  if (input?.active !== undefined) {
    const active = validateBoolean(input.active, 'active', errors);
    if (active.provided) {
      patch.active = active.value;
    }
  }
  if (input?.sortOrder !== undefined) {
    const sortOrder = Number(input.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
      errors.push(fieldError('sortOrder', 'Sort order must be between 0 and 9999.'));
    } else {
      patch.sortOrder = sortOrder;
    }
  }

  requireAtLeastOneField(patch, errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return patch;
}

export function validateCategoryQuery(input) {
  const errors = [];
  const query = validatePageParams(input, errors, { defaultLimit: 50, maxLimit: 100 });
  const type = validateEnum(input?.type, CATEGORY_TYPES, 'type', errors);
  if (type.value) {
    query.type = type.value;
  }
  const includeArchived = validateBooleanQuery(input?.includeArchived, 'includeArchived', errors);
  query.includeArchived = includeArchived.provided ? includeArchived.value === true : false;
  if (errors.length) {
    throwValidationError(errors);
  }
  return query;
}

// ---- Transactions ----

export function validateCreateTransaction(input) {
  const errors = [];
  const type = validateEnum(input?.type, TRANSACTION_TYPES, 'type', errors, { required: true });
  const amount = validateMoney(input?.amount, 'amount', errors, { positive: true });
  const currency = validateCurrency(input?.currency, 'currency', errors, {
    fallback: DEFAULT_CURRENCY,
  });
  const categoryId = validateOptionalId(input?.categoryId, 'categoryId', errors) ?? null;
  const accountId = validateOptionalId(input?.accountId, 'accountId', errors) ?? null;
  const counterAccountId = validateOptionalId(input?.counterAccountId, 'counterAccountId', errors) ?? null;
  const transactionDate = validateDateValue(input?.transactionDate, 'transactionDate', errors);
  const description = trimOptionalLine(input?.description, 'description', MAX_DESCRIPTION, errors);
  const merchant = trimOptionalLine(input?.merchant, 'merchant', MAX_MERCHANT, errors);
  const notes = validateOptionalText(input?.notes, 'notes', MAX_NOTES, errors);

  if (errors.length) {
    throwValidationError(errors);
  }
  return {
    type: type.value,
    amount,
    currency: currency ?? DEFAULT_CURRENCY,
    categoryId,
    accountId,
    counterAccountId,
    transactionDate,
    description: description ?? null,
    merchant: merchant ?? null,
    notes: notes ?? null,
  };
}

// Only presentation/classification fields may change. Amount, currency, type
// and accounts are immutable once posted — void and re-enter instead.
export function validateUpdateTransaction(input) {
  const errors = [];
  const patch = {};

  rejectImmutableFields(
    input,
    {
      amount: 'Amount cannot be edited. Void the transaction and record a new one.',
      currency: 'Currency cannot be edited. Void the transaction and record a new one.',
      type: 'Type cannot be edited. Void the transaction and record a new one.',
      accountId: 'The account cannot be edited. Void the transaction and record a new one.',
      counterAccountId: 'The transfer accounts cannot be edited. Void and record a new one.',
      status: 'Use the void endpoint to cancel a transaction.',
    },
    errors,
  );

  if (input?.description !== undefined) {
    patch.description = trimOptionalLine(input.description, 'description', MAX_DESCRIPTION, errors) ?? null;
  }
  if (input?.merchant !== undefined) {
    patch.merchant = trimOptionalLine(input.merchant, 'merchant', MAX_MERCHANT, errors) ?? null;
  }
  if (input?.notes !== undefined) {
    patch.notes = validateOptionalText(input.notes, 'notes', MAX_NOTES, errors) ?? null;
  }
  if (input?.categoryId !== undefined) {
    patch.categoryId = validateOptionalId(input.categoryId, 'categoryId', errors);
  }
  if (input?.transactionDate !== undefined) {
    patch.transactionDate = validateDateValue(input.transactionDate, 'transactionDate', errors);
  }

  requireAtLeastOneField(patch, errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return patch;
}

export function validateVoidTransaction(input) {
  const errors = [];
  const reason = validateOptionalText(input?.reason, 'reason', MAX_VOID_REASON, errors) ?? null;
  if (errors.length) {
    throwValidationError(errors);
  }
  return { reason };
}

export function validateTransactionQuery(input) {
  const errors = [];
  const query = validatePageParams(input, errors);

  const type = validateEnum(input?.type, TRANSACTION_TYPES, 'type', errors);
  if (type.value) {
    query.type = type.value;
  }
  const status = validateEnum(
    input?.status,
    TRANSACTION_STATUS_FILTERS,
    'status',
    errors,
  );
  query.status = status.value ?? 'POSTED';

  const categoryId = validateOptionalId(input?.categoryId, 'categoryId', errors);
  if (categoryId !== undefined && categoryId !== null) {
    query.categoryId = categoryId;
  }
  const accountId = validateOptionalId(input?.accountId, 'accountId', errors);
  if (accountId !== undefined && accountId !== null) {
    query.accountId = accountId;
  }
  const sourceType = validateEnum(input?.sourceType, SOURCE_TYPES, 'sourceType', errors);
  if (sourceType.value) {
    query.sourceType = sourceType.value;
  }

  // Validator-level range: from/to are independent of the service.
  const from = validateDateValue(input?.from, 'from', errors, { required: false });
  const to = validateDateValue(input?.to, 'to', errors, { required: false });
  if (from && to && to < from) {
    errors.push(fieldError('to', 'To must be on or after from.'));
  }
  if (from) {
    query.from = from;
  }
  if (to) {
    query.to = to;
  }

  const search = typeof input?.search === 'string' ? input.search.trim() : '';
  if (search.length > MAX_SEARCH) {
    errors.push(fieldError('search', `Search must be at most ${MAX_SEARCH} characters.`));
  } else if (search) {
    query.search = search;
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  return query;
}

// ---- Budgets ----

export function validateCreateBudget(input) {
  const errors = [];
  const categoryId = validateOptionalId(input?.categoryId, 'categoryId', errors) ?? null;
  if (!categoryId) {
    errors.push(fieldError('categoryId', 'Choose a category.'));
  }
  const amount = validateMoney(input?.amount, 'amount', errors, { positive: true });
  const currency = validateCurrency(input?.currency, 'currency', errors, {
    fallback: DEFAULT_CURRENCY,
  });
  const period = validateEnum(input?.period, BUDGET_PERIODS, 'period', errors);
  const year = validateYear(input?.year, 'year', errors);
  const month = validateMonth(input?.month, 'month', errors);
  const notes = validateOptionalText(input?.notes, 'notes', MAX_BUDGET_NOTES, errors);

  if (errors.length) {
    throwValidationError(errors);
  }
  return {
    categoryId,
    amount,
    currency: currency ?? DEFAULT_CURRENCY,
    period: period.value ?? 'MONTHLY',
    year,
    month,
    notes: notes ?? null,
  };
}

export function validateUpdateBudget(input) {
  const errors = [];
  const patch = {};

  if (input?.amount !== undefined) {
    patch.amount = validateMoney(input.amount, 'amount', errors, { positive: true });
  }
  if (input?.notes !== undefined) {
    patch.notes = validateOptionalText(input.notes, 'notes', MAX_BUDGET_NOTES, errors) ?? null;
  }
  rejectImmutableFields(
    input,
    {
      categoryId: 'The category cannot be edited. Delete this budget and create another.',
      currency: 'The currency cannot be edited. Delete this budget and create another.',
      year: 'The period cannot be edited. Delete this budget and create another.',
      month: 'The period cannot be edited. Delete this budget and create another.',
    },
    errors,
  );

  requireAtLeastOneField(patch, errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return patch;
}

export function validateBudgetQuery(input) {
  const errors = [];
  const query = validatePageParams(input, errors, { defaultLimit: 50, maxLimit: 100 });
  const year = validateYear(input?.year, 'year', errors, { required: false, fallback: null });
  if (year !== null) {
    query.year = year;
  }
  const month = validateMonth(input?.month, 'month', errors, { required: false, fallback: null });
  if (month !== null) {
    query.month = month;
  }
  const categoryId = validateOptionalId(input?.categoryId, 'categoryId', errors);
  if (categoryId !== undefined && categoryId !== null) {
    query.categoryId = categoryId;
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return query;
}

// ---- Bills ----

export function validateCreateBill(input) {
  const errors = [];
  const name = trimOptionalLine(input?.name, 'name', MAX_BILL_NAME, errors);
  if (!name) {
    errors.push(fieldError('name', `Name must be 1-${MAX_BILL_NAME} characters.`));
  }
  const amount = validateMoney(input?.amount, 'amount', errors, { positive: true });
  const currency = validateCurrency(input?.currency, 'currency', errors, {
    fallback: DEFAULT_CURRENCY,
  });
  const dueDate = validateDateValue(input?.dueDate, 'dueDate', errors);
  const categoryId = validateOptionalId(input?.categoryId, 'categoryId', errors) ?? null;
  if (!categoryId) {
    errors.push(fieldError('categoryId', 'Choose a category.'));
  }
  const accountId = validateOptionalId(input?.accountId, 'accountId', errors) ?? null;
  const recurring = validateBoolean(input?.recurring, 'recurring', errors);
  const notes = validateOptionalText(input?.notes, 'notes', MAX_NOTES, errors);

  if (errors.length) {
    throwValidationError(errors);
  }
  return {
    name,
    amount,
    currency: currency ?? DEFAULT_CURRENCY,
    dueDate,
    categoryId,
    accountId,
    recurring: recurring.value ?? false,
    notes: notes ?? null,
  };
}

export function validateUpdateBill(input) {
  const errors = [];
  const patch = {};

  if (input?.name !== undefined) {
    const name = trimOptionalLine(input.name, 'name', MAX_BILL_NAME, errors);
    if (!name) {
      errors.push(fieldError('name', `Name must be 1-${MAX_BILL_NAME} characters.`));
    } else {
      patch.name = name;
    }
  }
  if (input?.amount !== undefined) {
    patch.amount = validateMoney(input.amount, 'amount', errors, { positive: true });
  }
  if (input?.currency !== undefined) {
    patch.currency = validateCurrency(input.currency, 'currency', errors, { required: true });
  }
  if (input?.dueDate !== undefined) {
    patch.dueDate = validateDateValue(input.dueDate, 'dueDate', errors);
  }
  if (input?.categoryId !== undefined) {
    patch.categoryId = validateOptionalId(input.categoryId, 'categoryId', errors);
    if (!patch.categoryId) {
      errors.push(fieldError('categoryId', 'Choose a category.'));
    }
  }
  if (input?.accountId !== undefined) {
    patch.accountId = validateOptionalId(input.accountId, 'accountId', errors);
  }
  if (input?.recurring !== undefined) {
    const recurring = validateBoolean(input.recurring, 'recurring', errors);
    if (recurring.provided) {
      patch.recurring = recurring.value;
    }
  }
  if (input?.notes !== undefined) {
    patch.notes = validateOptionalText(input.notes, 'notes', MAX_NOTES, errors) ?? null;
  }
  if (input?.status !== undefined) {
    errors.push(fieldError('status', 'Use the pay or cancel endpoint to change a bill.'));
  }

  requireAtLeastOneField(patch, errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return patch;
}

// Paying settles the bill and creates the linked expense in one operation.
export function validatePayBill(input) {
  const errors = [];
  const transactionDate = validateDateValue(input?.transactionDate, 'transactionDate', errors, {
    required: false,
  });
  const accountId = validateOptionalId(input?.accountId, 'accountId', errors);
  const amount = validateMoney(input?.amount, 'amount', errors, { required: false, positive: true });
  const description = trimOptionalLine(input?.description, 'description', MAX_DESCRIPTION, errors);
  const merchant = trimOptionalLine(input?.merchant, 'merchant', MAX_MERCHANT, errors);
  const notes = validateOptionalText(input?.notes, 'notes', MAX_NOTES, errors);

  if (errors.length) {
    throwValidationError(errors);
  }
  return {
    transactionDate: transactionDate === undefined ? undefined : transactionDate,
    accountId: accountId === undefined ? undefined : accountId,
    amount: amount === undefined ? undefined : amount,
    description: description ?? null,
    merchant: merchant ?? null,
    notes: notes ?? null,
  };
}

export function validateBillQuery(input) {
  const errors = [];
  const query = validatePageParams(input, errors);
  const status = validateEnum(input?.status, BILL_STATUS_FILTERS, 'status', errors);
  query.status = status.value ?? 'ALL';

  const categoryId = validateOptionalId(input?.categoryId, 'categoryId', errors);
  if (categoryId !== undefined && categoryId !== null) {
    query.categoryId = categoryId;
  }
  const search = typeof input?.search === 'string' ? input.search.trim() : '';
  if (search.length > MAX_SEARCH) {
    errors.push(fieldError('search', `Search must be at most ${MAX_SEARCH} characters.`));
  } else if (search) {
    query.search = search;
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return query;
}

// ---- Recurring transactions ----

export function validateCreateRecurring(input) {
  const errors = [];
  const type = validateEnum(input?.type, TRANSACTION_TYPES, 'type', errors, { required: true });
  if (type.value === 'TRANSFER') {
    errors.push(fieldError('type', 'Recurring transfers are not supported. Choose income or expense.'));
  }
  const amount = validateMoney(input?.amount, 'amount', errors, { positive: true });
  const currency = validateCurrency(input?.currency, 'currency', errors, {
    fallback: DEFAULT_CURRENCY,
  });
  const categoryId = validateOptionalId(input?.categoryId, 'categoryId', errors) ?? null;
  if (!categoryId) {
    errors.push(fieldError('categoryId', 'Choose a category.'));
  }
  const accountId = validateOptionalId(input?.accountId, 'accountId', errors) ?? null;
  const description = trimOptionalLine(input?.description, 'description', MAX_DESCRIPTION, errors);
  const merchant = trimOptionalLine(input?.merchant, 'merchant', MAX_MERCHANT, errors);
  const notes = validateOptionalText(input?.notes, 'notes', MAX_NOTES, errors);
  const frequency = validateEnum(input?.frequency, RECURRENCE_FREQUENCIES, 'frequency', errors, {
    required: true,
  });
  const interval = validateInterval(input?.interval, 'interval', errors);
  const startDate = validateDateValue(input?.startDate, 'startDate', errors);
  const endDate = validateDateValue(input?.endDate, 'endDate', errors, { required: false });

  if (startDate && endDate && endDate < startDate) {
    errors.push(fieldError('endDate', 'End date must be on or after the start date.'));
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  return {
    type: type.value,
    amount,
    currency: currency ?? DEFAULT_CURRENCY,
    categoryId,
    accountId,
    description: description ?? null,
    merchant: merchant ?? null,
    notes: notes ?? null,
    frequency: frequency.value,
    interval,
    startDate,
    endDate: endDate === undefined ? null : endDate,
  };
}

export function validateUpdateRecurring(input) {
  const errors = [];
  const patch = {};

  rejectImmutableFields(
    input,
    {
      type: 'Type cannot be edited. Pause this rule and create another.',
      currency: 'Currency cannot be edited. Pause this rule and create another.',
      startDate: 'Start date cannot be edited. Pause this rule and create another.',
      frequency: 'Frequency cannot be edited. Pause this rule and create another.',
    },
    errors,
  );

  if (input?.amount !== undefined) {
    patch.amount = validateMoney(input.amount, 'amount', errors, { positive: true });
  }
  if (input?.categoryId !== undefined) {
    patch.categoryId = validateOptionalId(input.categoryId, 'categoryId', errors);
    if (!patch.categoryId) {
      errors.push(fieldError('categoryId', 'Choose a category.'));
    }
  }
  if (input?.accountId !== undefined) {
    patch.accountId = validateOptionalId(input.accountId, 'accountId', errors);
  }
  if (input?.description !== undefined) {
    patch.description = trimOptionalLine(input.description, 'description', MAX_DESCRIPTION, errors) ?? null;
  }
  if (input?.merchant !== undefined) {
    patch.merchant = trimOptionalLine(input.merchant, 'merchant', MAX_MERCHANT, errors) ?? null;
  }
  if (input?.notes !== undefined) {
    patch.notes = validateOptionalText(input.notes, 'notes', MAX_NOTES, errors) ?? null;
  }
  if (input?.interval !== undefined) {
    patch.interval = validateInterval(input.interval, 'interval', errors);
  }
  if (input?.endDate !== undefined) {
    patch.endDate = validateDateValue(input.endDate, 'endDate', errors, { required: false });
  }

  requireAtLeastOneField(patch, errors);
  if (errors.length) {
    throwValidationError(errors);
  }
  return patch;
}

export function validateRecurringQuery(input) {
  const errors = [];
  const query = validatePageParams(input, errors);
  const active = validateEnum(input?.active, ['ACTIVE', 'PAUSED', 'ALL'], 'active', errors);
  query.active = active.value ?? 'ALL';
  const type = validateEnum(input?.type, ['INCOME', 'EXPENSE'], 'type', errors);
  if (type.value) {
    query.type = type.value;
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return query;
}

// ---- Reports ----

// Defaults (current year/month in the user's timezone) are resolved by the
// service, which knows the timezone; the validator only checks formats.
export function validateMonthlyReportQuery(input) {
  const errors = [];
  const year = validateYear(input?.year, 'year', errors, { required: false, fallback: null });
  const month = validateMonth(input?.month, 'month', errors, { required: false, fallback: null });
  const currency = validateCurrency(input?.currency, 'currency', errors, {
    required: false,
    fallback: null,
  });
  if (errors.length) {
    throwValidationError(errors);
  }
  const query = {};
  if (year !== null) {
    query.year = year;
  }
  if (month !== null) {
    query.month = month;
  }
  if (currency) {
    query.currency = currency;
  }
  return query;
}
