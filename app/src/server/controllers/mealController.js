import { sendSuccess } from '../utils/http.js';
import * as mealService from '../services/mealService.js';
import * as shoppingService from '../services/shoppingService.js';

export async function listMeals(req, res, next) {
  try {
    const result = await mealService.listMeals({
      user: req.user,
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getMeal(req, res, next) {
  try {
    const meal = await mealService.getMeal({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { meal });
  } catch (error) {
    return next(error);
  }
}

export async function createMeal(req, res, next) {
  try {
    const meal = await mealService.createMeal({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { meal }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateMeal(req, res, next) {
  try {
    const meal = await mealService.updateMeal({
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { meal });
  } catch (error) {
    return next(error);
  }
}

export async function deleteMeal(req, res, next) {
  try {
    const result = await mealService.deleteMeal({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

// Read-only preview of the shopping requirements for a planned period; the
// commit happens through POST /api/shopping-lists/:id/from-meals.
export async function shoppingPlan(req, res, next) {
  try {
    const { from, to } = mealService.resolveMealRange(req.user, req.validated);
    const plan = await shoppingService.previewFromMeals({
      householdId: req.householdId,
      query: { from, to },
    });
    return sendSuccess(res, plan);
  } catch (error) {
    return next(error);
  }
}
