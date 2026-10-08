import { Router, raw } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as diaryController from '../controllers/diaryController.js';
import {
  validateCreateDiaryEntry,
  validateListDiaryQuery,
  validateUpdateDiaryEntry,
} from '../validators/diaryValidators.js';

const router = Router();

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const writeLimiter = createRateLimiter({ name: 'diary-write', windowMs: 60_000, max: 30 });
const uploadLimiter = createRateLimiter({ name: 'diary-upload', windowMs: 60_000, max: 15 });

// Raw binary body for image uploads; the service decides the real type from
// the magic bytes, so the declared content type only gates parsing.
const imageParser = raw({
  type: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/octet-stream'],
  limit: MAX_FILE_BYTES,
});

router.use(requireAuth, requireHousehold());

router.get('/meta', diaryController.listMeta);
router.get('/', validate(validateListDiaryQuery, 'query'), diaryController.listEntries);
router.post('/', writeLimiter, validate(validateCreateDiaryEntry), diaryController.createEntry);
router.get('/:id', diaryController.getEntry);
router.patch('/:id', writeLimiter, validate(validateUpdateDiaryEntry), diaryController.updateEntry);
router.delete('/:id', writeLimiter, diaryController.deleteEntry);

router.post('/:id/attachments', uploadLimiter, imageParser, diaryController.uploadAttachment);
router.get('/:id/attachments/:attachmentId', diaryController.serveAttachment);
router.delete('/:id/attachments/:attachmentId', writeLimiter, diaryController.deleteAttachment);

export default router;
