import fs from 'node:fs';
import { sendSuccess } from '../utils/http.js';
import * as financeService from '../services/financeService.js';
import * as financePlanningService from '../services/financePlanningService.js';

// ---- Meta ----

export async function getMeta(req, res, next) {
  try {
    const meta = await financeService.listMeta({ user: req.user, householdId: req.householdId });
    return sendSuccess(res, meta);
  } catch (error) {
    return next(error);
  }
}

// ---- Accounts ----

export async function listAccounts(req, res, next) {
  try {
    const result = await financeService.listAccounts({
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getAccount(req, res, next) {
  try {
    const account = await financeService.getAccount({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { account });
  } catch (error) {
    return next(error);
  }
}

export async function createAccount(req, res, next) {
  try {
    const account = await financeService.createAccount({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { account }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateAccount(req, res, next) {
  try {
    const account = await financeService.updateAccount({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { account });
  } catch (error) {
    return next(error);
  }
}

export async function archiveAccount(req, res, next) {
  try {
    const account = await financeService.archiveAccount({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { account });
  } catch (error) {
    return next(error);
  }
}

// ---- Categories ----

export async function listCategories(req, res, next) {
  try {
    const result = await financeService.listCategories({
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function createCategory(req, res, next) {
  try {
    const category = await financeService.createCategory({
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { category }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateCategory(req, res, next) {
  try {
    const category = await financeService.updateCategory({
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { category });
  } catch (error) {
    return next(error);
  }
}

export async function archiveCategory(req, res, next) {
  try {
    const category = await financeService.archiveCategory({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { category });
  } catch (error) {
    return next(error);
  }
}

// ---- Transactions ----

export async function listTransactions(req, res, next) {
  try {
    const result = await financeService.listTransactions({
      user: req.user,
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getTransaction(req, res, next) {
  try {
    const transaction = await financeService.getTransaction({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { transaction });
  } catch (error) {
    return next(error);
  }
}

export async function createTransaction(req, res, next) {
  try {
    const transaction = await financeService.createTransaction({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { transaction }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateTransaction(req, res, next) {
  try {
    const transaction = await financeService.updateTransaction({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { transaction });
  } catch (error) {
    return next(error);
  }
}

export async function voidTransaction(req, res, next) {
  try {
    const transaction = await financeService.voidTransaction({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      reason: req.validated.reason,
    });
    return sendSuccess(res, { transaction });
  } catch (error) {
    return next(error);
  }
}

// ---- Receipts ----

export async function uploadReceipt(req, res, next) {
  try {
    let filename = req.headers['x-filename'];
    if (typeof filename === 'string') {
      try {
        filename = decodeURIComponent(filename);
      } catch {
        // Malformed encoding: keep the raw value, sanitization still applies.
      }
    }
    const receipt = await financeService.addReceipt({
      user: req.user,
      householdId: req.householdId,
      transactionId: req.params.id,
      buffer: req.body,
      originalName: filename,
    });
    return sendSuccess(res, { receipt }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function serveReceipt(req, res, next) {
  try {
    const file = await financeService.getReceipt({
      householdId: req.householdId,
      transactionId: req.params.id,
    });
    const wantsDownload = req.query.download === '1' || req.query.download === 'true';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader(
      'Content-Disposition',
      `${wantsDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    const stream = fs.createReadStream(file.filePath);
    stream.on('error', (error) => next(error));
    return stream.pipe(res);
  } catch (error) {
    return next(error);
  }
}

export async function deleteReceipt(req, res, next) {
  try {
    const result = await financeService.deleteReceipt({
      user: req.user,
      householdId: req.householdId,
      transactionId: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

// ---- Budgets ----

export async function listBudgets(req, res, next) {
  try {
    const result = await financePlanningService.listBudgets({
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getBudget(req, res, next) {
  try {
    const budget = await financePlanningService.getBudget({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { budget });
  } catch (error) {
    return next(error);
  }
}

export async function createBudget(req, res, next) {
  try {
    const budget = await financePlanningService.createBudget({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { budget }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateBudget(req, res, next) {
  try {
    const budget = await financePlanningService.updateBudget({
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { budget });
  } catch (error) {
    return next(error);
  }
}

export async function deleteBudget(req, res, next) {
  try {
    const result = await financePlanningService.deleteBudget({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

// ---- Bills ----

export async function listBills(req, res, next) {
  try {
    const result = await financePlanningService.listBills({
      user: req.user,
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getBill(req, res, next) {
  try {
    const bill = await financePlanningService.getBill({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { bill });
  } catch (error) {
    return next(error);
  }
}

export async function createBill(req, res, next) {
  try {
    const bill = await financePlanningService.createBill({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { bill }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateBill(req, res, next) {
  try {
    const bill = await financePlanningService.updateBill({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { bill });
  } catch (error) {
    return next(error);
  }
}

export async function payBill(req, res, next) {
  try {
    const result = await financePlanningService.payBill({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      data: req.validated,
    });
    return sendSuccess(res, result, 201);
  } catch (error) {
    return next(error);
  }
}

export async function cancelBill(req, res, next) {
  try {
    const bill = await financePlanningService.cancelBill({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { bill });
  } catch (error) {
    return next(error);
  }
}

// ---- Recurring ----

export async function listRecurring(req, res, next) {
  try {
    const result = await financePlanningService.listRecurring({
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getRecurring(req, res, next) {
  try {
    const recurring = await financePlanningService.getRecurring({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { recurring });
  } catch (error) {
    return next(error);
  }
}

export async function createRecurring(req, res, next) {
  try {
    const recurring = await financePlanningService.createRecurring({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { recurring }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateRecurring(req, res, next) {
  try {
    const recurring = await financePlanningService.updateRecurring({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { recurring });
  } catch (error) {
    return next(error);
  }
}

export async function pauseRecurring(req, res, next) {
  try {
    const recurring = await financePlanningService.setRecurringPaused({
      householdId: req.householdId,
      id: req.params.id,
      active: false,
    });
    return sendSuccess(res, { recurring });
  } catch (error) {
    return next(error);
  }
}

export async function resumeRecurring(req, res, next) {
  try {
    const recurring = await financePlanningService.setRecurringPaused({
      householdId: req.householdId,
      id: req.params.id,
      active: true,
    });
    return sendSuccess(res, { recurring });
  } catch (error) {
    return next(error);
  }
}

// ---- Reports ----

export async function monthlyReport(req, res, next) {
  try {
    const report = await financeService.getMonthlyReport({
      user: req.user,
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, report);
  } catch (error) {
    return next(error);
  }
}
