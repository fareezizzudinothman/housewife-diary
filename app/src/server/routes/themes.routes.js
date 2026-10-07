import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as themeController from '../controllers/themeController.js';
import { validateThemeUpdate } from '../validators/themeValidators.js';

const router = Router();

// Public: preset catalog (needed to theme the login page before auth).
router.get('/', themeController.listThemes);

router.use(requireAuth);

router.get('/me', themeController.getMyTheme);
router.patch('/me', validate(validateThemeUpdate), themeController.updateMyTheme);
router.delete('/me', themeController.resetMyTheme);

export default router;
