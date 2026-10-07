import { Router } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as taskController from '../controllers/taskController.js';
import {
  validateCreateTask,
  validateListTaskQuery,
  validateTaskCategory,
  validateUpdateTask,
} from '../validators/taskValidators.js';

const router = Router();

const writeLimiter = createRateLimiter({ name: 'tasks-write', windowMs: 60_000, max: 60 });

router.use(requireAuth, requireHousehold());

// Static segments come before /:id so they are never shadowed.
router.get('/meta', taskController.listMeta);
router.get('/categories', taskController.listCategories);
router.post(
  '/categories',
  writeLimiter,
  validate(validateTaskCategory),
  taskController.createCategory,
);
router.delete('/categories/:id', writeLimiter, taskController.deleteCategory);

router.get('/', validate(validateListTaskQuery, 'query'), taskController.listTasks);
router.post('/', writeLimiter, validate(validateCreateTask), taskController.createTask);
router.get('/:id', taskController.getTask);
router.patch('/:id', writeLimiter, validate(validateUpdateTask), taskController.updateTask);
router.delete('/:id', writeLimiter, taskController.deleteTask);
router.post('/:id/complete', writeLimiter, taskController.completeTask);

export default router;
