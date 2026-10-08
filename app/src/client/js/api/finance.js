import { api, apiUpload } from './client.js';

// Finance API transport. Money values cross the wire as 2-decimal strings.

function query(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const suffix = search.toString();
  return suffix ? `?${suffix}` : '';
}

export function getFinanceMeta() {
  return api.get('/finance/meta');
}

// ---- Accounts ----

export function listAccounts(params = {}) {
  return api.get(`/finance/accounts${query(params)}`);
}

export function getAccount(id) {
  return api.get(`/finance/accounts/${encodeURIComponent(id)}`);
}

export function createAccount(payload) {
  return api.post('/finance/accounts', payload);
}

export function updateAccount(id, payload) {
  return api.patch(`/finance/accounts/${encodeURIComponent(id)}`, payload);
}

export function archiveAccount(id) {
  return api.post(`/finance/accounts/${encodeURIComponent(id)}/archive`, {});
}

// ---- Categories ----

export function listCategories(params = {}) {
  return api.get(`/finance/categories${query(params)}`);
}

export function createCategory(payload) {
  return api.post('/finance/categories', payload);
}

export function updateCategory(id, payload) {
  return api.patch(`/finance/categories/${encodeURIComponent(id)}`, payload);
}

export function archiveCategory(id) {
  return api.post(`/finance/categories/${encodeURIComponent(id)}/archive`, {});
}

// ---- Transactions ----

export function listTransactions(params = {}) {
  return api.get(`/finance/transactions${query(params)}`);
}

export function getTransaction(id) {
  return api.get(`/finance/transactions/${encodeURIComponent(id)}`);
}

export function createTransaction(payload) {
  return api.post('/finance/transactions', payload);
}

export function updateTransaction(id, payload) {
  return api.patch(`/finance/transactions/${encodeURIComponent(id)}`, payload);
}

export function voidTransaction(id, payload = {}) {
  return api.post(`/finance/transactions/${encodeURIComponent(id)}/void`, payload);
}

export function uploadReceipt(id, file) {
  return apiUpload(`/finance/transactions/${encodeURIComponent(id)}/receipt`, file);
}

export function deleteReceipt(id) {
  return api.del(`/finance/transactions/${encodeURIComponent(id)}/receipt`);
}

export function receiptUrl(id, { download = false } = {}) {
  return `/api/finance/transactions/${encodeURIComponent(id)}/receipt${download ? '?download=1' : ''}`;
}

// ---- Budgets ----

export function listBudgets(params = {}) {
  return api.get(`/finance/budgets${query(params)}`);
}

export function createBudget(payload) {
  return api.post('/finance/budgets', payload);
}

export function updateBudget(id, payload) {
  return api.patch(`/finance/budgets/${encodeURIComponent(id)}`, payload);
}

export function deleteBudget(id) {
  return api.del(`/finance/budgets/${encodeURIComponent(id)}`);
}

// ---- Bills ----

export function listBills(params = {}) {
  return api.get(`/finance/bills${query(params)}`);
}

export function getBill(id) {
  return api.get(`/finance/bills/${encodeURIComponent(id)}`);
}

export function createBill(payload) {
  return api.post('/finance/bills', payload);
}

export function updateBill(id, payload) {
  return api.patch(`/finance/bills/${encodeURIComponent(id)}`, payload);
}

export function payBill(id, payload = {}) {
  return api.post(`/finance/bills/${encodeURIComponent(id)}/pay`, payload);
}

export function cancelBill(id) {
  return api.post(`/finance/bills/${encodeURIComponent(id)}/cancel`, {});
}

// ---- Recurring ----

export function listRecurring(params = {}) {
  return api.get(`/finance/recurring${query(params)}`);
}

export function createRecurring(payload) {
  return api.post('/finance/recurring', payload);
}

export function updateRecurring(id, payload) {
  return api.patch(`/finance/recurring/${encodeURIComponent(id)}`, payload);
}

export function pauseRecurring(id) {
  return api.post(`/finance/recurring/${encodeURIComponent(id)}/pause`, {});
}

export function resumeRecurring(id) {
  return api.post(`/finance/recurring/${encodeURIComponent(id)}/resume`, {});
}

// ---- Reports ----

export function getMonthlyReport(params = {}) {
  return api.get(`/finance/reports/monthly${query(params)}`);
}
