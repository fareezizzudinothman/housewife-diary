import { sendSuccess } from '../utils/http.js';
import * as ideasService from '../services/ideasService.js';

export async function listIdeas(req, res, next) {
  try {
    const result = await ideasService.listIdeas({
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getIdea(req, res, next) {
  try {
    const idea = await ideasService.getIdea({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { idea });
  } catch (error) {
    return next(error);
  }
}

export async function createIdea(req, res, next) {
  try {
    const idea = await ideasService.createIdea({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { idea }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateIdea(req, res, next) {
  try {
    const idea = await ideasService.updateIdea({
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { idea });
  } catch (error) {
    return next(error);
  }
}

export async function deleteIdea(req, res, next) {
  try {
    const result = await ideasService.deleteIdea({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function generateIdeaTask(req, res, next) {
  try {
    const task = await ideasService.generateIdeaTask({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { task }, 201);
  } catch (error) {
    return next(error);
  }
}