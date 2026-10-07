import { sendSuccess } from '../utils/http.js';
import * as taskService from '../services/taskService.js';

export async function listMeta(req, res, next) {
  try {
    const meta = await taskService.listMeta({ householdId: req.householdId });
    return sendSuccess(res, meta);
  } catch (error) {
    return next(error);
  }
}

export async function listTasks(req, res, next) {
  try {
    const result = await taskService.listTasks({
      user: req.user,
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getTask(req, res, next) {
  try {
    const task = await taskService.getTask({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { task });
  } catch (error) {
    return next(error);
  }
}

export async function createTask(req, res, next) {
  try {
    const task = await taskService.createTask({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { task }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateTask(req, res, next) {
  try {
    const task = await taskService.updateTask({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { task });
  } catch (error) {
    return next(error);
  }
}

export async function completeTask(req, res, next) {
  try {
    const task = await taskService.completeTask({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { task });
  } catch (error) {
    return next(error);
  }
}

export async function deleteTask(req, res, next) {
  try {
    const series = req.query.series === 'true' || req.query.series === '1';
    const result = await taskService.deleteTask({
      householdId: req.householdId,
      id: req.params.id,
      series,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function listCategories(req, res, next) {
  try {
    const result = await taskService.listCategories({ householdId: req.householdId });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function createCategory(req, res, next) {
  try {
    const category = await taskService.createCategory({
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { category }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function deleteCategory(req, res, next) {
  try {
    const result = await taskService.deleteCategory({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}
