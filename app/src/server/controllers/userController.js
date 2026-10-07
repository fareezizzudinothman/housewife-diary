import { sendSuccess } from '../utils/http.js';
import * as userService from '../services/userService.js';

export async function getMe(req, res, next) {
  try {
    const me = await userService.getMe(req.user);
    return sendSuccess(res, me);
  } catch (error) {
    return next(error);
  }
}

export async function updateMe(req, res, next) {
  try {
    const me = await userService.updateMe(req.user, req.validated);
    return sendSuccess(res, me);
  } catch (error) {
    return next(error);
  }
}
