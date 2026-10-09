/**
 * AI Service Layer
 *
 * Business logic for AI conversations and messages.
 * Handles authentication, household context, and orchestrates the AI provider.
 */

import { AppError, ErrorCodes } from '../../shared/errors.js';
import * as aiRepository from '../repositories/aiRepository.js';
import { AIOrchestrator } from '../ai/orchestrator.js';

function notFound(message = 'Conversation not found.') {
  return new AppError(message, { code: ErrorCodes.NOT_FOUND, status: 404 });
}

function toConversationView(conversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    messageCount: conversation.messages?.length ?? 0,
    lastMessageAt: conversation.messages?.[conversation.messages.length - 1]?.createdAt ?? conversation.updatedAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

function toMessageView(message) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    metadata: message.metadata,
    createdAt: message.createdAt,
  };
}

export class AIService {
  constructor({ orchestrator }) {
    this.orchestrator = orchestrator;
  }

  /**
   * Create a new conversation
   */
  async createConversation({ user, householdId, title = 'New Conversation' }) {
    const conversation = await aiRepository.createConversation({
      householdId,
      userId: user.id,
      title,
    });
    return toConversationView(conversation);
  }

  /**
   * List conversations for the current user
   */
  async listConversations({ user, householdId, query }) {
    const result = await aiRepository.listConversations({
      householdId,
      userId: user.id,
      page: query.page,
      limit: query.limit,
    });

    return {
      items: result.items.map(toConversationView),
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    };
  }

  /**
   * Get a conversation with its messages
   */
  async getConversation({ user, householdId, id }) {
    const conversation = await aiRepository.findConversationWithMessages(id, householdId);
    if (!conversation) {
      throw notFound();
    }
    if (conversation.userId !== user.id) {
      throw notFound();
    }

    return {
      ...toConversationView(conversation),
      messages: conversation.messages.map(toMessageView),
    };
  }

  /**
   * Delete a conversation
   */
  async deleteConversation({ user, householdId, id }) {
    const conversation = await aiRepository.findConversationById(id, householdId);
    if (!conversation) {
      throw notFound();
    }
    if (conversation.userId !== user.id) {
      throw notFound();
    }

    await aiRepository.deleteMessagesByConversation(id);
    await aiRepository.deleteConversation(id, householdId);

    return { id, deleted: true };
  }

  /**
   * Send a message and process AI response
   */
  async sendMessage({ user, householdId, conversationId, content, context }) {
    // Verify conversation exists and belongs to user
    const conversation = await aiRepository.findConversationById(conversationId, householdId);
    if (!conversation) {
      throw notFound();
    }
    if (conversation.userId !== user.id) {
      throw notFound();
    }

    // If this is the first message, update conversation title from content
    const messageCount = await aiRepository.countMessagesByConversation(conversationId);
    if (messageCount === 0) {
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      await aiRepository.updateConversationTitle(conversationId, householdId, title);
    }

    // Process the message through the orchestrator
    return this.orchestrator.processMessage({
      conversationId,
      userId: user.id,
      householdId,
      content,
      context,
    });
  }

  /**
   * Handle a confirmed action
   */
  async handleConfirmation({ user, householdId, conversationId, toolCallId, toolName, confirmed, context }) {
    // Verify conversation exists and belongs to user
    const conversation = await aiRepository.findConversationById(conversationId, householdId);
    if (!conversation) {
      throw notFound();
    }
    if (conversation.userId !== user.id) {
      throw notFound();
    }

    return this.orchestrator.handleConfirmation({
      conversationId,
      userId: user.id,
      householdId,
      toolCallId,
      toolName,
      confirmed,
      context,
    });
  }

  /**
   * Rename a conversation
   */
  async renameConversation({ user, householdId, id, title }) {
    const conversation = await aiRepository.findConversationById(id, householdId);
    if (!conversation) {
      throw notFound();
    }
    if (conversation.userId !== user.id) {
      throw notFound();
    }

    const updated = await aiRepository.updateConversationTitle(id, householdId, title);
    return toConversationView(updated);
  }
}

export default AIService;