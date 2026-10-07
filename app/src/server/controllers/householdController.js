import { sendSuccess } from '../utils/http.js';
import * as householdService from '../services/householdService.js';

export async function createHousehold(req, res, next) {
  try {
    const created = await householdService.createHousehold({
      user: req.user,
      ...req.validated,
    });
    return sendSuccess(res, created, 201);
  } catch (error) {
    return next(error);
  }
}

export async function listHouseholds(req, res, next) {
  try {
    const households = await householdService.listMyHouseholds(req.user);
    return sendSuccess(res, { households });
  } catch (error) {
    return next(error);
  }
}

export async function getHousehold(req, res, next) {
  try {
    const household = await householdService.getHousehold({
      user: req.user,
      householdId: req.params.id,
    });
    return sendSuccess(res, household);
  } catch (error) {
    return next(error);
  }
}

export async function switchHousehold(req, res, next) {
  try {
    const result = await householdService.switchActiveHousehold({
      user: req.user,
      householdId: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function listMembers(req, res, next) {
  try {
    const members = await householdService.listMembers({
      user: req.user,
      householdId: req.params.id,
    });
    return sendSuccess(res, { members });
  } catch (error) {
    return next(error);
  }
}

export async function addMember(req, res, next) {
  try {
    const member = await householdService.addMember({
      user: req.user,
      householdId: req.params.id,
      ...req.validated,
    });
    return sendSuccess(res, { member }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateMemberRole(req, res, next) {
  try {
    const result = await householdService.updateMemberRole({
      user: req.user,
      householdId: req.params.id,
      targetUserId: req.params.userId,
      ...req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function removeMember(req, res, next) {
  try {
    const result = await householdService.removeMember({
      user: req.user,
      householdId: req.params.id,
      targetUserId: req.params.userId,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function leaveHousehold(req, res, next) {
  try {
    const result = await householdService.leave({
      user: req.user,
      householdId: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}
