import { Router } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as recipeController from '../controllers/recipeController.js';
import {
  validateCreateRecipe,
  validateListRecipeQuery,
  validateRecipeCopy,
  validateUpdateRecipe,
} from '../validators/recipeValidators.js';

const router = Router();

const writeLimiter = createRateLimiter({ name: 'recipes-write', windowMs: 60_000, max: 60 });

router.use(requireAuth, requireHousehold());

router.get('/meta', recipeController.listMeta);
router.get('/', validate(validateListRecipeQuery, 'query'), recipeController.listRecipes);
router.post('/', writeLimiter, validate(validateCreateRecipe), recipeController.createRecipe);
router.get('/:id', recipeController.getRecipe);
router.patch('/:id', writeLimiter, validate(validateUpdateRecipe), recipeController.updateRecipe);
router.delete('/:id', writeLimiter, recipeController.deleteRecipe);
router.post('/:id/favourite', writeLimiter, recipeController.favouriteRecipe);
router.delete('/:id/favourite', writeLimiter, recipeController.unfavouriteRecipe);
router.post('/:id/duplicate', writeLimiter, validate(validateRecipeCopy), recipeController.duplicateRecipe);

export default router;
