import { sendSuccess } from '../utils/http.js';
import * as recipeService from '../services/recipeService.js';

export async function listRecipes(req, res, next) {
  try {
    const result = await recipeService.listRecipes({
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function listMeta(req, res, next) {
  try {
    const meta = await recipeService.listMeta({ householdId: req.householdId });
    return sendSuccess(res, meta);
  } catch (error) {
    return next(error);
  }
}

export async function getRecipe(req, res, next) {
  try {
    const recipe = await recipeService.getRecipe({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { recipe });
  } catch (error) {
    return next(error);
  }
}

export async function createRecipe(req, res, next) {
  try {
    const recipe = await recipeService.createRecipe({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { recipe }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateRecipe(req, res, next) {
  try {
    const recipe = await recipeService.updateRecipe({
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { recipe });
  } catch (error) {
    return next(error);
  }
}

export async function deleteRecipe(req, res, next) {
  try {
    const result = await recipeService.deleteRecipe({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function favouriteRecipe(req, res, next) {
  try {
    const recipe = await recipeService.setFavourite({
      householdId: req.householdId,
      id: req.params.id,
      isFavourite: true,
    });
    return sendSuccess(res, { recipe });
  } catch (error) {
    return next(error);
  }
}

export async function unfavouriteRecipe(req, res, next) {
  try {
    const recipe = await recipeService.setFavourite({
      householdId: req.householdId,
      id: req.params.id,
      isFavourite: false,
    });
    return sendSuccess(res, { recipe });
  } catch (error) {
    return next(error);
  }
}

export async function duplicateRecipe(req, res, next) {
  try {
    const recipe = await recipeService.duplicateRecipe({
      householdId: req.householdId,
      id: req.params.id,
      title: req.validated.title,
    });
    return sendSuccess(res, { recipe }, 201);
  } catch (error) {
    return next(error);
  }
}
