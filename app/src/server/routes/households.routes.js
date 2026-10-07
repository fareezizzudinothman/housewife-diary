import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as householdController from '../controllers/householdController.js';
import {
  validateAddMember,
  validateCreateHousehold,
  validateUpdateMemberRole,
} from '../validators/householdValidators.js';

const router = Router();

router.use(requireAuth);

router.post(
  '/',
  validate(validateCreateHousehold),
  householdController.createHousehold,
);
router.get('/', householdController.listHouseholds);
router.get('/:id', householdController.getHousehold);
router.post('/:id/switch', householdController.switchHousehold);
router.get('/:id/members', householdController.listMembers);
router.post('/:id/members', validate(validateAddMember), householdController.addMember);
router.patch(
  '/:id/members/:userId',
  validate(validateUpdateMemberRole),
  householdController.updateMemberRole,
);
router.delete('/:id/members/:userId', householdController.removeMember);
router.post('/:id/leave', householdController.leaveHousehold);

export default router;
