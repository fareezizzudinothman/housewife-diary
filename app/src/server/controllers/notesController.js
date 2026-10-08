import { sendSuccess } from '../utils/http.js';
import * as notesService from '../services/notesService.js';

export async function listNotes(req, res, next) {
  try {
    const result = await notesService.listNotes({
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getNote(req, res, next) {
  try {
    const note = await notesService.getNote({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { note });
  } catch (error) {
    return next(error);
  }
}

export async function createNote(req, res, next) {
  try {
    const note = await notesService.createNote({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { note }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateNote(req, res, next) {
  try {
    const note = await notesService.updateNote({
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { note });
  } catch (error) {
    return next(error);
  }
}

export async function deleteNote(req, res, next) {
  try {
    const result = await notesService.deleteNote({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function listNoteTags(req, res, next) {
  try {
    const result = await notesService.listNoteTags({
      householdId: req.householdId,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}