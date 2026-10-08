import { Router } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as notificationController from '../controllers/notificationController.js';
import { validateNotificationQuery, validateNotificationId } from '../validators/notificationValidators.js';

const router = Router();

router.use(requireAuth, requireHousehold());

router.get('/', validate(validateNotificationQuery, 'query'), notificationController.listNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.post('/read-all', notificationController.markAllRead);
router.post('/:id/read', validate(validateNotificationId, 'params'), notificationController.markRead);
router.post('/:id/archive', validate(validateNotificationId, 'params'), notificationController.archiveNotification);
router.delete('/:id', validate(validateNotificationId, 'params'), notificationController.deleteNotification);

// Admin/owner only: trigger notification generation for the household
router.post('/generate', notificationController.triggerGenerate);

export default router;