import { sendSuccess } from '../utils/http.js';
import * as themeService from '../services/themeService.js';

export async function listThemes(_req, res, next) {
  try {
    const presets = await themeService.getPresets();
    return sendSuccess(res, presets);
  } catch (error) {
    return next(error);
  }
}

export async function getMyTheme(req, res, next) {
  try {
    const theme = await themeService.getMine(req.user.id);
    return sendSuccess(res, theme);
  } catch (error) {
    return next(error);
  }
}

export async function updateMyTheme(req, res, next) {
  try {
    const theme = await themeService.updateMine(req.user.id, req.validated);
    return sendSuccess(res, theme);
  } catch (error) {
    return next(error);
  }
}

export async function resetMyTheme(req, res, next) {
  try {
    const theme = await themeService.resetMine(req.user.id);
    return sendSuccess(res, theme);
  } catch (error) {
    return next(error);
  }
}
