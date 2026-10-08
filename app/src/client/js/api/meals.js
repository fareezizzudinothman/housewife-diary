import { api } from './client.js';

// Meal planner API — one entry per planned meal, optionally linked to a
// recipe. See docs/meals.md.

export function listMeals({ from, to, mealType } = {}) {
  const query = new URLSearchParams();
  if (from) {
    query.set('from', from);
  }
  if (to) {
    query.set('to', to);
  }
  if (mealType) {
    query.set('mealType', mealType);
  }
  const suffix = query.toString();
  return api.get(`/meals${suffix ? `?${suffix}` : ''}`);
}

export function getMeal(mealId) {
  return api.get(`/meals/${encodeURIComponent(mealId)}`);
}

export function createMeal(payload) {
  return api.post('/meals', payload);
}

export function updateMeal(mealId, payload) {
  return api.patch(`/meals/${encodeURIComponent(mealId)}`, payload);
}

export function deleteMeal(mealId) {
  return api.del(`/meals/${encodeURIComponent(mealId)}`);
}

// Read-only preview of the shopping requirements for planned meals.
export function getMealShoppingPlan({ from, to } = {}) {
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
