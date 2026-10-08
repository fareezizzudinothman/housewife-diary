import { api } from './client.js';

// Inventory API — stock levels change only through the transaction
// endpoints. See docs/inventory.md.

export function listInventory(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/inventory${suffix ? `?${suffix}` : ''}`);
}

export function getInventoryItem(itemId) {
  return api.get(`/inventory/${encodeURIComponent(itemId)}`);
}

export function createInventoryItem(payload) {
  return api.post('/inventory', payload);
}

export function updateInventoryItem(itemId, payload) {
  return api.patch(`/inventory/${encodeURIComponent(itemId)}`, payload);
}

export function deleteInventoryItem(itemId) {
  return api.del(`/inventory/${encodeURIComponent(itemId)}`);
}

export function consumeInventoryItem(itemId, payload) {
  return api.post(`/inventory/${encodeURIComponent(itemId)}/consume`, payload);
}

export function wasteInventoryItem(itemId, payload) {
  return api.post(`/inventory/${encodeURIComponent(itemId)}/waste`, payload);
}

export function addInventoryStock(itemId, payload) {
  return api.post(`/inventory/${encodeURIComponent(itemId)}/add-stock`, payload);
}

export function adjustInventoryItem(itemId, payload) {
  return api.post(`/inventory/${encodeURIComponent(itemId)}/adjust`, payload);
}

export function listInventoryTransactions(itemId, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(
    `/inventory/${encodeURIComponent(itemId)}/transactions${suffix ? `?${suffix}` : ''}`,
  );
}
