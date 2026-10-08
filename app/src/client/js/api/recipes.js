import { api } from './client.js';

// Recipes API — household-scoped, with structured ingredients. See
// docs/recipes.md for the endpoint contract.

export function listRecipes(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/recipes${suffix ? `?${suffix}` : ''}`);
}

export function getRecipeMeta() {
  return api.get('/recipes/meta');
}

export function getRecipe(recipeId) {
  return api.get(`/recipes/${encodeURIComponent(recipeId)}`);
}

export function createRecipe(payload) {
  return api.post('/recipes', payload);
}

export function updateRecipe(recipeId, payload) {
  return api.patch(`/recipes/${encodeURIComponent(recipeId)}`, payload);
}

export function deleteRecipe(recipeId) {
  return api.del(`/recipes/${encodeURIComponent(recipeId)}`);
}

export function favouriteRecipe(recipeId) {
  return api.post(`/recipes/${encodeURIComponent(recipeId)}/favourite`, {});
}

export function unfavouriteRecipe(recipeId) {
  return api.del(`/recipes/${encodeURIComponent(recipeId)}/favourite`);
}

export function duplicateRecipe(recipeId, title) {
  return api.post(`/recipes/${encodeURIComponent(recipeId)}/duplicate`, title ? { title } : {});
}
