import { Router } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as notesController from '../controllers/notesController.js';
import {
  validateCreateNote,
  validateNoteQuery,
  validateUpdateNote,
} from '../validators/notesValidators.js';

const router = Router();

const writeLimiter = createRateLimiter({ name: 'notes-write', windowMs: 60_000, max: 120 });

router.use(requireAuth, requireHousehold());

router.get('/tags', notesController.listNoteTags);
router.get('/', validate(validateNoteQuery, 'query'), notesController.listNotes);
router.post('/', writeLimiter, validate(validateCreateNote), notesController.createNote);
router.get('/:id', notesController.getNote);
router.patch('/:id', writeLimiter, validate(validateUpdateNote), notesController.updateNote);
router.delete('/:id', writeLimiter, notesController.deleteNote);

export default router;