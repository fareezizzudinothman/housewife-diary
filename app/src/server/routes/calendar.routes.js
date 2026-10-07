import { Router } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as calendarController from '../controllers/calendarController.js';
import {
  validateCreateEvent,
  validateListCalendarQuery,
  validateUpdateEvent,
} from '../validators/calendarValidators.js';

const router = Router();

const writeLimiter = createRateLimiter({ name: 'calendar-write', windowMs: 60_000, max: 60 });

router.use(requireAuth, requireHousehold());

router.get('/', validate(validateListCalendarQuery, 'query'), calendarController.listEvents);
router.post('/', writeLimiter, validate(validateCreateEvent), calendarController.createEvent);
router.get('/:id', calendarController.getEvent);
router.patch('/:id', writeLimiter, validate(validateUpdateEvent), calendarController.updateEvent);
router.delete('/:id', writeLimiter, calendarController.deleteEvent);

export default router;
