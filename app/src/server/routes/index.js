import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';
import householdsRoutes from './households.routes.js';
import themesRoutes from './themes.routes.js';
import diaryRoutes from './diary.routes.js';
import dashboardRoutes from './dashboard.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/households', householdsRoutes);
router.use('/themes', themesRoutes);
router.use('/diary', diaryRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
