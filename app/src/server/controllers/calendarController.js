import { sendSuccess } from '../utils/http.js';
import * as calendarService from '../services/calendarService.js';

export async function listEvents(req, res, next) {
  try {
    const result = await calendarService.listEvents({
      user: req.user,
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getEvent(req, res, next) {
  try {
    const event = await calendarService.getEvent({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { event });
  } catch (error) {
    return next(error);
  }
}

export async function createEvent(req, res, next) {
  try {
    const event = await calendarService.createEvent({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { event }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateEvent(req, res, next) {
  try {
    const event = await calendarService.updateEvent({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { event });
  } catch (error) {
    return next(error);
  }
}

export async function deleteEvent(req, res, next) {
  try {
    const result = await calendarService.deleteEvent({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}
