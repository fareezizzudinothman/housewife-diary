import { sendSuccess } from '../utils/http.js';
import * as inventoryService from '../services/inventoryService.js';

export async function listInventory(req, res, next) {
  try {
    const result = await inventoryService.listInventory({
      user: req.user,
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getInventoryItem(req, res, next) {
  try {
    const item = await inventoryService.getInventoryItem({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { item });
  } catch (error) {
    return next(error);
  }
}

export async function createInventoryItem(req, res, next) {
  try {
    const item = await inventoryService.createInventoryItem({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { item }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateInventoryItem(req, res, next) {
  try {
    const item = await inventoryService.updateInventoryItem({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { item });
  } catch (error) {
    return next(error);
  }
}

export async function deleteInventoryItem(req, res, next) {
  try {
    const result = await inventoryService.deleteInventoryItem({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function consumeItem(req, res, next) {
  try {
    const result = await inventoryService.consumeItem({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      data: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function wasteItem(req, res, next) {
  try {
    const result = await inventoryService.wasteItem({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      data: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function addStock(req, res, next) {
  try {
    const result = await inventoryService.addStock({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      data: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function adjustStock(req, res, next) {
  try {
    const result = await inventoryService.adjustStock({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      data: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function listTransactions(req, res, next) {
  try {
    const result = await inventoryService.listTransactions({
      householdId: req.householdId,
      id: req.params.id,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}
