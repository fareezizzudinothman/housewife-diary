import { Router, raw } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as financeController from '../controllers/financeController.js';
import {
  validateAccountQuery,
  validateBillQuery,
  validateBudgetQuery,
  validateCategoryQuery,
  validateCreateAccount,
  validateCreateBill,
  validateCreateBudget,
  validateCreateCategory,
  validateCreateRecurring,
  validateCreateTransaction,
  validateMonthlyReportQuery,
  validatePayBill,
  validateRecurringQuery,
  validateTransactionQuery,
  validateUpdateAccount,
  validateUpdateBill,
  validateUpdateBudget,
  validateUpdateCategory,
  validateUpdateRecurring,
  validateUpdateTransaction,
  validateVoidTransaction,
} from '../validators/financeValidators.js';

const router = Router();

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const writeLimiter = createRateLimiter({ name: 'finance-write', windowMs: 60_000, max: 80 });
const uploadLimiter = createRateLimiter({ name: 'finance-upload', windowMs: 60_000, max: 15 });

// Raw binary body for receipt uploads; the service decides the real type from
// the magic bytes, so the declared content type only gates parsing.
const receiptParser = raw({
  type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/octet-stream'],
  limit: MAX_FILE_BYTES,
});

router.use(requireAuth, requireHousehold());

router.get('/meta', financeController.getMeta);

// Accounts.
router.get('/accounts', validate(validateAccountQuery, 'query'), financeController.listAccounts);
router.post('/accounts', writeLimiter, validate(validateCreateAccount), financeController.createAccount);
router.get('/accounts/:id', financeController.getAccount);
router.patch('/accounts/:id', writeLimiter, validate(validateUpdateAccount), financeController.updateAccount);
router.post('/accounts/:id/archive', writeLimiter, financeController.archiveAccount);

// Categories.
router.get('/categories', validate(validateCategoryQuery, 'query'), financeController.listCategories);
router.post('/categories', writeLimiter, validate(validateCreateCategory), financeController.createCategory);
router.patch('/categories/:id', writeLimiter, validate(validateUpdateCategory), financeController.updateCategory);
router.post('/categories/:id/archive', writeLimiter, financeController.archiveCategory);

// Transactions and receipts.
router.get('/transactions', validate(validateTransactionQuery, 'query'), financeController.listTransactions);
router.post('/transactions', writeLimiter, validate(validateCreateTransaction), financeController.createTransaction);
router.get('/transactions/:id', financeController.getTransaction);
router.patch('/transactions/:id', writeLimiter, validate(validateUpdateTransaction), financeController.updateTransaction);
router.post('/transactions/:id/void', writeLimiter, validate(validateVoidTransaction), financeController.voidTransaction);
router.post('/transactions/:id/receipt', uploadLimiter, receiptParser, financeController.uploadReceipt);
router.get('/transactions/:id/receipt', financeController.serveReceipt);
router.delete('/transactions/:id/receipt', writeLimiter, financeController.deleteReceipt);

// Budgets.
router.get('/budgets', validate(validateBudgetQuery, 'query'), financeController.listBudgets);
router.post('/budgets', writeLimiter, validate(validateCreateBudget), financeController.createBudget);
router.get('/budgets/:id', financeController.getBudget);
router.patch('/budgets/:id', writeLimiter, validate(validateUpdateBudget), financeController.updateBudget);
router.delete('/budgets/:id', writeLimiter, financeController.deleteBudget);

// Bills.
router.get('/bills', validate(validateBillQuery, 'query'), financeController.listBills);
router.post('/bills', writeLimiter, validate(validateCreateBill), financeController.createBill);
router.get('/bills/:id', financeController.getBill);
router.patch('/bills/:id', writeLimiter, validate(validateUpdateBill), financeController.updateBill);
router.post('/bills/:id/pay', writeLimiter, validate(validatePayBill), financeController.payBill);
router.post('/bills/:id/cancel', writeLimiter, financeController.cancelBill);

// Recurring transactions.
router.get('/recurring', validate(validateRecurringQuery, 'query'), financeController.listRecurring);
router.post('/recurring', writeLimiter, validate(validateCreateRecurring), financeController.createRecurring);
router.get('/recurring/:id', financeController.getRecurring);
router.patch('/recurring/:id', writeLimiter, validate(validateUpdateRecurring), financeController.updateRecurring);
router.post('/recurring/:id/pause', writeLimiter, financeController.pauseRecurring);
router.post('/recurring/:id/resume', writeLimiter, financeController.resumeRecurring);

// Reports.
router.get(
  '/reports/monthly',
  validate(validateMonthlyReportQuery, 'query'),
  financeController.monthlyReport,
);

export default router;
