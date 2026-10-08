import { sendSuccess } from '../utils/http.js';
import * as homeService from '../services/homeService.js';

export async function listRooms(req, res, next) {
  try {
    const result = await homeService.listRooms({ householdId: req.householdId, query: req.validated });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getRoom(req, res, next) {
  try {
    const room = await homeService.getRoom({ householdId: req.householdId, id: req.params.id });
    return sendSuccess(res, room);
  } catch (error) {
    return next(error);
  }
}

export async function createRoom(req, res, next) {
  try {
    const room = await homeService.createRoom({ user: req.user, householdId: req.householdId, data: req.validated });
    return sendSuccess(res, { room }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateRoom(req, res, next) {
  try {
    const room = await homeService.updateRoom({ householdId: req.householdId, id: req.params.id, patch: req.validated });
    return sendSuccess(res, { room });
  } catch (error) {
    return next(error);
  }
}

export async function deleteRoom(req, res, next) {
  try {
    const result = await homeService.deleteRoom({ householdId: req.householdId, id: req.params.id });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function listCleaning(req, res, next) {
  try {
    const result = await homeService.listCleaning({ householdId: req.householdId, query: req.validated });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getCleaning(req, res, next) {
  try {
    const cleaning = await homeService.getCleaning({ householdId: req.householdId, id: req.params.id });
    return sendSuccess(res, cleaning);
  } catch (error) {
    return next(error);
  }
}

export async function createCleaning(req, res, next) {
  try {
    const cleaning = await homeService.createCleaning({ user: req.user, householdId: req.householdId, data: req.validated });
    return sendSuccess(res, { cleaning }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateCleaning(req, res, next) {
  try {
    const cleaning = await homeService.updateCleaning({ user: req.user, householdId: req.householdId, id: req.params.id, patch: req.validated });
    return sendSuccess(res, { cleaning });
  } catch (error) {
    return next(error);
  }
}

export async function deleteCleaning(req, res, next) {
  try {
    const result = await homeService.deleteCleaning({ householdId: req.householdId, id: req.params.id });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function listLaundry(req, res, next) {
  try {
    const result = await homeService.listLaundry({ householdId: req.householdId, query: req.validated });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getLaundry(req, res, next) {
  try {
    const item = await homeService.getLaundry({ householdId: req.householdId, id: req.params.id });
    return sendSuccess(res, item);
  } catch (error) {
    return next(error);
  }
}

export async function createLaundry(req, res, next) {
  try {
    const item = await homeService.createLaundry({ user: req.user, householdId: req.householdId, data: req.validated });
    return sendSuccess(res, { item }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateLaundry(req, res, next) {
  try {
    const item = await homeService.updateLaundry({ householdId: req.householdId, id: req.params.id, patch: req.validated });
    return sendSuccess(res, { item });
  } catch (error) {
    return next(error);
  }
}

export async function deleteLaundry(req, res, next) {
  try {
    const result = await homeService.deleteLaundry({ householdId: req.householdId, id: req.params.id });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function listMaintenance(req, res, next) {
  try {
    const result = await homeService.listMaintenance({ householdId: req.householdId, query: req.validated });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getMaintenance(req, res, next) {
  try {
    const maintenance = await homeService.getMaintenance({ householdId: req.householdId, id: req.params.id });
    return sendSuccess(res, maintenance);
  } catch (error) {
    return next(error);
  }
}

export async function createMaintenance(req, res, next) {
  try {
    const maintenance = await homeService.createMaintenance({ user: req.user, householdId: req.householdId, data: req.validated });
    return sendSuccess(res, { maintenance }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateMaintenance(req, res, next) {
  try {
    const maintenance = await homeService.updateMaintenance({ householdId: req.householdId, id: req.params.id, patch: req.validated });
    return sendSuccess(res, { maintenance });
  } catch (error) {
    return next(error);
  }
}

export async function deleteMaintenance(req, res, next) {
  try {
    const result = await homeService.deleteMaintenance({ householdId: req.householdId, id: req.params.id });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function generateMaintenanceTask(req, res, next) {
  try {
    const task = await homeService.generateMaintenanceTask({ user: req.user, householdId: req.householdId, id: req.params.id });
    return sendSuccess(res, { task }, 201);
  } catch (error) {
    return next(error);
  }
}