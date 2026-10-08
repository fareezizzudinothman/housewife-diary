import { Router, raw } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as documentsController from '../controllers/documentsController.js';
import {
  validateCreateDocument,
  validateDocumentQuery,
  validateUpdateDocument,
} from '../validators/documentsValidators.js';

const router = Router();

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const writeLimiter = createRateLimiter({ name: 'documents-write', windowMs: 60_000, max: 60 });
const uploadLimiter = createRateLimiter({ name: 'documents-upload', windowMs: 60_000, max: 15 });

// Raw binary body for document uploads; the service decides the real type from
// the magic bytes. Metadata (title, category, expiryDate…) travels as query
// parameters so a single request carries both the file and its record.
const fileParser = raw({
  type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/octet-stream'],
  limit: MAX_FILE_BYTES,
});

router.use(requireAuth, requireHousehold());

router.get('/', validate(validateDocumentQuery, 'query'), documentsController.listDocuments);
router.post('/', uploadLimiter, fileParser, validate(validateCreateDocument, 'query'), documentsController.createDocument);
router.get('/:id', documentsController.getDocument);
router.patch('/:id', writeLimiter, validate(validateUpdateDocument), documentsController.updateDocument);
router.delete('/:id', writeLimiter, documentsController.deleteDocument);
router.get('/:id/file', documentsController.serveDocumentFile);

export default router;