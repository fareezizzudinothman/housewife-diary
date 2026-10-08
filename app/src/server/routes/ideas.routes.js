import { Router } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as ideasController from '../controllers/ideasController.js';
import {
  validateCreateIdea,
  validateIdeaQuery,
  validateUpdateIdea,
} from '../validators/ideasValidators.js';

const router = Router();

const writeLimiter = createRateLimiter({ name: 'ideas-write', windowMs: 60_000, max: 120 });

router.use(requireAuth, requireHousehold());

router.get('/', validate(validateIdeaQuery, 'query'), ideasController.listIdeas);
router.post('/', writeLimiter, validate(validateCreateIdea), ideasController.createIdea);
router.get('/:id', ideasController.getIdea);
router.patch('/:id', writeLimiter, validate(validateUpdateIdea), ideasController.updateIdea);
router.delete('/:id', writeLimiter, ideasController.deleteIdea);
router.post('/:id/task', writeLimiter, ideasController.generateIdeaTask);

export default router;