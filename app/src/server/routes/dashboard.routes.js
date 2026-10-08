import { Router } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import * as dashboardController from '../controllers/dashboardController.js';

const router = Router();

router.use(requireAuth, requireHousehold());

router.get('/', dashboardController.getDashboard);

export default router;
