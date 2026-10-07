import { sendSuccess } from '../utils/http.js';
import { checkHealth } from '../services/healthService.js';

export async function getHealth(_req, res, next) {
  try {
    const health = await checkHealth();
    return sendSuccess(res, health);
  } catch (error) {
    return next(error);
  }
}
