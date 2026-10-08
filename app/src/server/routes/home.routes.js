import { Router } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as homeController from '../controllers/homeController.js';
import {
  validateCleaningQuery,
  validateCreateCleaning,
  validateCreateLaundry,
  validateCreateMaintenance,
  validateCreateRoom,
  validateLaundryQuery,
  validateMaintenanceQuery,
  validateRoomQuery,
  validateUpdateCleaning,
  validateUpdateLaundry,
  validateUpdateMaintenance,
  validateUpdateRoom,
} from '../validators/homeValidators.js';

const router = Router();

const writeLimiter = createRateLimiter({ name: 'home-write', windowMs: 60_000, max: 60 });

router.use(requireAuth, requireHousehold());

// Rooms
router.get('/rooms', validate(validateRoomQuery, 'query'), homeController.listRooms);
router.get('/rooms/:id', homeController.getRoom);
router.post('/rooms', writeLimiter, validate(validateCreateRoom), homeController.createRoom);
router.patch('/rooms/:id', writeLimiter, validate(validateUpdateRoom), homeController.updateRoom);
router.delete('/rooms/:id', writeLimiter, homeController.deleteRoom);

// Cleaning schedules
router.get('/cleaning', validate(validateCleaningQuery, 'query'), homeController.listCleaning);
router.get('/cleaning/:id', homeController.getCleaning);
router.post('/cleaning', writeLimiter, validate(validateCreateCleaning), homeController.createCleaning);
router.patch('/cleaning/:id', writeLimiter, validate(validateUpdateCleaning), homeController.updateCleaning);
router.delete('/cleaning/:id', writeLimiter, homeController.deleteCleaning);

// Laundry
router.get('/laundry', validate(validateLaundryQuery, 'query'), homeController.listLaundry);
router.get('/laundry/:id', homeController.getLaundry);
router.post('/laundry', writeLimiter, validate(validateCreateLaundry), homeController.createLaundry);
router.patch('/laundry/:id', writeLimiter, validate(validateUpdateLaundry), homeController.updateLaundry);
router.delete('/laundry/:id', writeLimiter, homeController.deleteLaundry);

// Maintenance
router.get('/maintenance', validate(validateMaintenanceQuery, 'query'), homeController.listMaintenance);
router.get('/maintenance/:id', homeController.getMaintenance);
router.post('/maintenance', writeLimiter, validate(validateCreateMaintenance), homeController.createMaintenance);
router.patch('/maintenance/:id', writeLimiter, validate(validateUpdateMaintenance), homeController.updateMaintenance);
router.delete('/maintenance/:id', writeLimiter, homeController.deleteMaintenance);
router.post('/maintenance/:id/task', writeLimiter, homeController.generateMaintenanceTask);

export default router;