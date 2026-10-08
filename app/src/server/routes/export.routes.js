import { Router } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import * as exportController from '../controllers/exportController.js';

const router = Router();

router.use(requireAuth, requireHousehold());

router.get('/', exportController.exportData);
router.get('/status', exportController.exportStatus);

export default router;