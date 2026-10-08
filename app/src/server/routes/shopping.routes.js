import { Router } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as shoppingController from '../controllers/shoppingController.js';
import {
  validateCreateItem,
  validateCreateList,
  validateFromMeals,
  validateFromRecipe,
  validateItemsQuery,
  validateListShoppingQuery,
  validateToInventory,
  validateUpdateItem,
  validateUpdateList,
} from '../validators/shoppingValidators.js';

const router = Router();

const writeLimiter = createRateLimiter({ name: 'shopping-write', windowMs: 60_000, max: 80 });

router.use(requireAuth, requireHousehold());

router.get('/', validate(validateListShoppingQuery, 'query'), shoppingController.listLists);
router.post('/', writeLimiter, validate(validateCreateList), shoppingController.createList);

router.get('/:id/items', validate(validateItemsQuery, 'query'), shoppingController.listItems);
router.post('/:id/items', writeLimiter, validate(validateCreateItem), shoppingController.createItem);
router.patch(
  '/:id/items/:itemId',
  writeLimiter,
  validate(validateUpdateItem),
  shoppingController.updateItem,
);
router.delete('/:id/items/:itemId', writeLimiter, shoppingController.deleteItem);
router.post(
  '/:id/items/:itemId/to-inventory',
  writeLimiter,
  validate(validateToInventory),
  shoppingController.addItemToInventory,
);

router.post(
  '/:id/from-recipe/:recipeId',
  writeLimiter,
  validate(validateFromRecipe),
  shoppingController.addFromRecipe,
);
router.post(
  '/:id/from-meals',
  writeLimiter,
  validate(validateFromMeals),
  shoppingController.addFromMeals,
);

router.get('/:id', shoppingController.getList);
router.patch('/:id', writeLimiter, validate(validateUpdateList), shoppingController.updateList);
router.delete('/:id', writeLimiter, shoppingController.deleteList);

export default router;
