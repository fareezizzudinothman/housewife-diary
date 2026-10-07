import { Router } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as inventoryController from '../controllers/inventoryController.js';
import {
  validateAddStock,
  validateAdjust,
  validateConsume,
  validateCreateInventory,
  validateInventoryQuery,
  validateTransactionsQuery,
  validateUpdateInventory,
  validateWaste,
} from '../validators/inventoryValidators.js';

const router = Router();

const writeLimiter = createRateLimiter({ name: 'inventory-write', windowMs: 60_000, max: 80 });

router.use(requireAuth, requireHousehold());

router.get('/', validate(validateInventoryQuery, 'query'), inventoryController.listInventory);
router.post('/', writeLimiter, validate(validateCreateInventory), inventoryController.createInventoryItem);

router.get('/:id', inventoryController.getInventoryItem);
router.patch('/:id', writeLimiter, validate(validateUpdateInventory), inventoryController.updateInventoryItem);
router.delete('/:id', writeLimiter, inventoryController.deleteInventoryItem);

router.post('/:id/consume', writeLimiter, validate(validateConsume), inventoryController.consumeItem);
router.post('/:id/waste', writeLimiter, validate(validateWaste), inventoryController.wasteItem);
router.post('/:id/add-stock', writeLimiter, validate(validateAddStock), inventoryController.addStock);
router.post('/:id/adjust', writeLimiter, validate(validateAdjust), inventoryController.adjustStock);

router.get(
  '/:id/transactions',
  validate(validateTransactionsQuery, 'query'),
  inventoryController.listTransactions,
);

export default router;
