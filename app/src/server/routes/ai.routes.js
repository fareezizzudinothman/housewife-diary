/**
 * AI Assistant Routes with Service Initialization
 */

import { Router } from 'express';
import { requireAuth, requireHousehold } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as aiController from '../controllers/aiController.js';
import createAIService from '../services/aiInit.js';
import {
  validateConversationQuery,
  validateCreateConversation,
  validateSendMessage,
  validateConfirmation,
  validateConversationId,
  validateRenameConversation,
} from '../validators/aiValidators.js';

// Import all services needed by AI tools
import * as dashboardService from '../services/dashboardService.js';
import * as taskService from '../services/taskService.js';
import * as calendarService from '../services/calendarService.js';
import * as mealService from '../services/mealService.js';
import * as shoppingService from '../services/shoppingService.js';
import * as inventoryService from '../services/inventoryService.js';
import * as financeService from '../services/financeService.js';
import * as familyService from '../services/familyService.js';
import * as homeService from '../services/homeService.js';
import * as documentsService from '../services/documentsService.js';
import * as notesService from '../services/notesService.js';
import * as ideasService from '../services/ideasService.js';
import * as notificationService from '../services/notificationService.js';

const router = Router();

const writeLimiter = createRateLimiter({ name: 'ai-write', windowMs: 60_000, max: 60 });
const messageLimiter = createRateLimiter({ name: 'ai-messages', windowMs: 60_000, max: 30 });

// All AI routes require authentication and household context
router.use(requireAuth, requireHousehold());

// Initialize AI service with all required dependencies
const services = {
  dashboardService,
  taskService,
  calendarService,
  mealService,
  shoppingService,
  inventoryService,
  financeService,
  familyService,
  homeService,
  documentsService,
  notesService,
  ideasService,
  notificationService,
};

// Set the AI service instance in the controller
aiController.setAIService(createAIService(services));

// Conversation list and creation
router.get('/conversations', validate(validateConversationQuery, 'query'), aiController.listConversations);
router.post('/conversations', writeLimiter, validate(validateCreateConversation), aiController.createConversation);

// Provider status (for frontend to check if AI is available)
router.get('/status', aiController.getProviderStatus);

// Conversation-specific routes
router.get('/conversations/:id', validate(validateConversationId, 'params'), aiController.getConversation);
router.patch('/conversations/:id', writeLimiter, validate(validateConversationId, 'params'), validate(validateRenameConversation), aiController.renameConversation);
router.delete('/conversations/:id', writeLimiter, validate(validateConversationId, 'params'), aiController.deleteConversation);

// Messages
router.post('/conversations/:id/messages', messageLimiter, validate(validateConversationId, 'params'), validate(validateSendMessage), aiController.sendMessage);

// Confirmation endpoint for write tools
router.post('/conversations/:id/confirm', messageLimiter, validate(validateConversationId, 'params'), validate(validateConfirmation), aiController.confirmAction);

export default router;