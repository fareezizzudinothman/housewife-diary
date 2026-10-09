/**
 * AI Assistant Controller
 */

import { sendSuccess } from '../utils/http.js';
import createAIService from '../services/aiInit.js';
import { AIOrchestratorError, OrchestratorErrorCodes } from '../ai/orchestrator.js';

// Services will be passed in from the route initialization
let aiServiceInstance = null;

export function setAIService(service) {
  aiServiceInstance = service;
}

function getAIService() {
  if (!aiServiceInstance) {
    throw new Error('AI Service not initialized. Call setAIService() first.');
  }
  return aiServiceInstance;
}

export async function listConversations(req, res, next) {
  try {
    const service = getAIService();
    const result = await service.listConversations({
      user: req.user,
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function createConversation(req, res, next) {
  try {
    const service = getAIService();
    const conversation = await service.createConversation({
      user: req.user,
      householdId: req.householdId,
      title: req.validated.title,
    });
    return sendSuccess(res, { conversation }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function getConversation(req, res, next) {
  try {
    const service = getAIService();
    const conversation = await service.getConversation({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { conversation });
  } catch (error) {
    return next(error);
  }
}

export async function deleteConversation(req, res, next) {
  try {
    const service = getAIService();
    const result = await service.deleteConversation({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function renameConversation(req, res, next) {
  try {
    const service = getAIService();
    const conversation = await service.renameConversation({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      title: req.validated.title,
    });
    return sendSuccess(res, { conversation });
  } catch (error) {
    return next(error);
  }
}

export async function sendMessage(req, res, next) {
  try {
    const service = getAIService();
    const context = {
      userName: req.user.name,
      userRole: req.householdRole,
      timezone: req.user.timezone,
    };

    const result = await service.sendMessage({
      user: req.user,
      householdId: req.householdId,
      conversationId: req.params.id,
      content: req.validated.content,
      context,
    });

    // Handle different response types
    if (result.type === 'confirmation_required') {
      return sendSuccess(res, {
        type: 'confirmation_required',
        confirmation: result.confirmation,
        conversationId: result.conversationId,
      });
    }

    return sendSuccess(res, {
      type: 'response',
      message: { role: 'assistant', content: result.content },
      usage: result.usage,
      iterations: result.iterations,
    });
  } catch (error) {
    // Handle AI-specific errors with appropriate status codes
    if (error instanceof AIOrchestratorError) {
      const status = error.status || 500;
      return res.status(status).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }
    return next(error);
  }
}

export async function confirmAction(req, res, next) {
  try {
    const service = getAIService();
    const context = {
      userName: req.user.name,
      userRole: req.householdRole,
      timezone: req.user.timezone,
    };

    const result = await service.handleConfirmation({
      user: req.user,
      householdId: req.householdId,
      conversationId: req.params.id,
      toolCallId: req.validated.toolCallId,
      toolName: req.validated.toolName,
      confirmed: req.validated.confirmed,
      context,
    });

    if (result.type === 'cancelled') {
      return sendSuccess(res, { message: result.message, type: 'cancelled' });
    }

    return sendSuccess(res, {
      type: 'response',
      message: { role: 'assistant', content: result.content },
      actionResult: result.actionResult,
      usage: result.usage,
    });
  } catch (error) {
    if (error instanceof AIOrchestratorError) {
      const status = error.status || 500;
      return res.status(status).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }
    return next(error);
  }
}

export async function getProviderStatus(req, res, next) {
  try {
    const { getAIProvider } = await import('../services/aiInit.js');
    const provider = getAIProvider();
    const available = provider ? await provider.isAvailable() : false;
    return sendSuccess(res, {
      available,
      provider: 'openai',
    });
  } catch (error) {
    return next(error);
  }
}