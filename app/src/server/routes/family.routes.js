import { Router } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as familyController from '../controllers/familyController.js';
import {
  validateCreateFamilyEvent,
  validateCreateFamilyMember,
  validateFamilyEventQuery,
  validateFamilyMemberQuery,
  validateUpdateFamilyEvent,
  validateUpdateFamilyMember,
} from '../validators/familyValidators.js';

const router = Router();

const writeLimiter = createRateLimiter({ name: 'family-write', windowMs: 60_000, max: 60 });

router.use(requireAuth, requireHousehold());

router.get('/meta', familyController.getMeta);

router.get('/members', validate(validateFamilyMemberQuery, 'query'), familyController.listMembers);
router.post('/members', writeLimiter, validate(validateCreateFamilyMember), familyController.createMember);
router.get('/members/:id', familyController.getMember);
router.patch('/members/:id', writeLimiter, validate(validateUpdateFamilyMember), familyController.updateMember);
router.delete('/members/:id', writeLimiter, familyController.archiveMember);

router.get('/events', validate(validateFamilyEventQuery, 'query'), familyController.listEvents);
router.post('/events', writeLimiter, validate(validateCreateFamilyEvent), familyController.createEvent);
router.get('/events/:id', familyController.getEvent);
router.patch('/events/:id', writeLimiter, validate(validateUpdateFamilyEvent), familyController.updateEvent);
router.delete('/events/:id', writeLimiter, familyController.deleteEvent);

export default router;