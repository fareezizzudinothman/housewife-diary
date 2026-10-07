import { sendSuccess } from '../utils/http.js';
import * as dashboardService from '../services/dashboardService.js';

export async function getDashboard(req, res, next) {
  try {
    const dashboard = await dashboardService.getDashboard({
      user: req.user,
      householdId: req.householdId,
      householdRole: req.householdRole,
    });
    return sendSuccess(res, dashboard);
  } catch (error) {
    return next(error);
  }
}
