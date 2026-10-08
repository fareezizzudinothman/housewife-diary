import { sendSuccess } from '../utils/http.js';
import * as shoppingService from '../services/shoppingService.js';

export async function listLists(req, res, next) {
  try {
    const result = await shoppingService.listLists({
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getList(req, res, next) {
  try {
    const list = await shoppingService.getList({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { list });
  } catch (error) {
    return next(error);
  }
}

export async function createList(req, res, next) {
  try {
    const list = await shoppingService.createList({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { list }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateList(req, res, next) {
  try {
    const list = await shoppingService.updateList({
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { list });
  } catch (error) {
    return next(error);
  }
}

export async function deleteList(req, res, next) {
  try {
    const result = await shoppingService.deleteList({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function listItems(req, res, next) {
  try {
    const result = await shoppingService.listItems({
      householdId: req.householdId,
      listId: req.params.id,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function createItem(req, res, next) {
  try {
    const item = await shoppingService.createItem({
      householdId: req.householdId,
      listId: req.params.id,
      data: req.validated,
    });
    return sendSuccess(res, { item }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateItem(req, res, next) {
  try {
    const item = await shoppingService.updateItem({
      householdId: req.householdId,
      listId: req.params.id,
      itemId: req.params.itemId,
      patch: req.validated,
    });
    return sendSuccess(res, { item });
  } catch (error) {
    return next(error);
  }
}

export async function deleteItem(req, res, next) {
  try {
    const result = await shoppingService.deleteItem({
      householdId: req.householdId,
      listId: req.params.id,
      itemId: req.params.itemId,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function addItemToInventory(req, res, next) {
  try {
    const result = await shoppingService.addItemToInventory({
      user: req.user,
      householdId: req.householdId,
      listId: req.params.id,
      itemId: req.params.itemId,
      data: req.validated,
    });
    return sendSuccess(res, result, 201);
  } catch (error) {
    return next(error);
  }
}

export async function addFromRecipe(req, res, next) {
  try {
    const result = await shoppingService.addFromRecipe({
      householdId: req.householdId,
      listId: req.params.id,
      recipeId: req.params.recipeId,
      servings: req.validated.servings,
    });
    return sendSuccess(res, result, 201);
  } catch (error) {
    return next(error);
  }
}

export async function addFromMeals(req, res, next) {
  try {
    const result = await shoppingService.addFromMeals({
      householdId: req.householdId,
      listId: req.params.id,
      from: req.validated.from,
      to: req.validated.to,
      items: req.validated.items,
    });
    return sendSuccess(res, result, 201);
  } catch (error) {
    return next(error);
  }
}
