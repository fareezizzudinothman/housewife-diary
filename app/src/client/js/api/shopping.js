import { api } from './client.js';

// Shopping API — household lists, items, and the recipe/meal → list bridges.
// See docs/shopping.md.

export function listShoppingLists(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/shopping-lists${suffix ? `?${suffix}` : ''}`);
}

export function getShoppingList(listId) {
  return api.get(`/shopping-lists/${encodeURIComponent(listId)}`);
}

export function createShoppingList(payload) {
  return api.post('/shopping-lists', payload);
}

export function updateShoppingList(listId, payload) {
  return api.patch(`/shopping-lists/${encodeURIComponent(listId)}`, payload);
}

export function deleteShoppingList(listId) {
  return api.del(`/shopping-lists/${encodeURIComponent(listId)}`);
}

export function listShoppingItems(listId, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/shopping-lists/${encodeURIComponent(listId)}/items${suffix ? `?${suffix}` : ''}`);
}

export function createShoppingItem(listId, payload) {
  return api.post(`/shopping-lists/${encodeURIComponent(listId)}/items`, payload);
}

export function updateShoppingItem(listId, itemId, payload) {
  return api.patch(
    `/shopping-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
    payload,
  );
}

export function deleteShoppingItem(listId, itemId) {
  return api.del(
    `/shopping-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
  );
}

export function addRecipeToShoppingList(listId, recipeId, servings) {
  return api.post(
    `/shopping-lists/${encodeURIComponent(listId)}/from-recipe/${encodeURIComponent(recipeId)}`,
    servings ? { servings } : {},
  );
}

export function previewMealsToShopping({ from, to } = {}) {
  const query = new URLSearchParams();
  if (from) {
    query.set('from', from);
  }
  if (to) {
    query.set('to', to);
  }
  const suffix = query.toString();
  return api.get(`/meals/shopping-plan${suffix ? `?${suffix}` : ''}`);
}

export function addMealsToShoppingList(listId, payload) {
  return api.post(`/shopping-lists/${encodeURIComponent(listId)}/from-meals`, payload);
}

export function shoppingItemToInventory(listId, itemId, payload = {}) {
  return api.post(
    `/shopping-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}/to-inventory`,
    payload,
  );
}
