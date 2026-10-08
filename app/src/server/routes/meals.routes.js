import { Router } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as mealController from '../controllers/mealController.js';
import {
  validateCreateMeal,
  validateMealRangeQuery,
  validateUpdateMeal,
} from '../validators/mealValidators.js';

const router = Router();

const writeLimiter = createRateLimiter({ name: 'meals-write', windowMs: 60_000, max: 60 });

router.use(requireAuth, requireHousehold());

router.get('/shopping-plan', validate(validateMealRangeQuery, 'query'), mealController.shoppingPlan);
router.get('/', validate(validateMealRangeQuery, 'query'), mealController.listMeals);
router.post('/', writeLimiter, validate(validateCreateMeal), mealController.createMeal);
router.get('/:id', mealController.getMeal);
router.patch('/:id', writeLimiter, validate(validateUpdateMeal), mealController.updateMeal);
router.delete('/:id', writeLimiter, mealController.deleteMeal);

export default router;
