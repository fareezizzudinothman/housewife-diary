import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as userController from '../controllers/userController.js';
import { validateUpdateProfile } from '../validators/userValidators.js';

const router = Router();

router.use(requireAuth);

router.get('/me', userController.getMe);
router.patch('/me', validate(validateUpdateProfile), userController.updateMe);

export default router;
