import { sendSuccess } from '../utils/http.js';
import * as familyService from '../services/familyService.js';

export async function getMeta(req, res, next) {
  try {
    const meta = await familyService.listMeta({ householdId: req.householdId });
    return sendSuccess(res, meta);
  } catch (error) {
    return next(error);
  }
}

export async function listMembers(req, res, next) {
  try {
    const result = await familyService.listMembers({
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getMember(req, res, next) {
  try {
    const member = await familyService.getMember({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, member);
  } catch (error) {
    return next(error);
  }
}

export async function createMember(req, res, next) {
  try {
    const member = await familyService.createMember({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { member }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateMember(req, res, next) {
  try {
    const member = await familyService.updateMember({
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { member });
  } catch (error) {
    return next(error);
  }
}

export async function archiveMember(req, res, next) {
  try {
    const member = await familyService.archiveMember({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { member });
  } catch (error) {
    return next(error);
  }
}

export async function listEvents(req, res, next) {
  try {
    const result = await familyService.listEvents({
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
    const event = await familyService.getEvent({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, event);
  } catch (error) {
    return next(error);
  }
}

export async function createEvent(req, res, next) {
  try {
    const event = await familyService.createEvent({
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
    const event = await familyService.updateEvent({
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
    const result = await familyService.deleteEvent({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}