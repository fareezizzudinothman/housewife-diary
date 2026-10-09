/**
 * AI Assistant Validators
 */

import { fieldError, throwValidationError, trimString } from './shared.js';
import { validatePageParams, validateBoolean, validateOptionalLine } from './kitchen.js';

export const MAX_CONVERSATION_TITLE = 200;
export const MAX_MESSAGE_CONTENT = 10000;
export const MAX_CONFIRMATION_TOOL_NAME = 64;

function validateId(value) {
  if (/^[a-zA-Z0-9_-]{1,64}$/.test(String(value))) {
    return String(value);
  }
  return null;
}

export function validateConversationId(value) {
  const id = validateId(value);
  if (!id) {
    throwValidationError([fieldError('id', 'Invalid conversation id.')]);
  }
  return id;
}

export function validateCreateConversation(input) {
  const errors = [];
  const title = validateOptionalLine(input?.title, 'title', MAX_CONVERSATION_TITLE, errors);
  if (title !== null && title !== undefined && title.length === 0) {
    errors.push(fieldError('title', `Title must be 1-${MAX_CONVERSATION_TITLE} characters.`));
  }
  if (errors.length > 0) {
    throwValidationError(errors);
  }
  return { title: title ?? 'New Conversation' };
}

export function validateSendMessage(input) {
  const errors = [];
  const content = trimString(input?.content);
  if (!content || content.length < 1 || content.length > MAX_MESSAGE_CONTENT) {
    errors.push(fieldError('content', `Message must be 1-${MAX_MESSAGE_CONTENT} characters.`));
  }
  if (errors.length > 0) {
    throwValidationError(errors);
  }
  return { content };
}

export function validateConfirmation(input) {
  const errors = [];
  const toolCallId = validateId(input?.toolCallId);
  if (!toolCallId) {
    errors.push(fieldError('toolCallId', 'Invalid tool call id.'));
  }
  const toolName = trimString(input?.toolName);
  if (!toolName || toolName.length > MAX_CONFIRMATION_TOOL_NAME) {
    errors.push(fieldError('toolName', 'Invalid tool name.'));
  }
  const confirmed = validateBoolean(input?.confirmed, 'confirmed', errors);
  if (confirmed.value === undefined) {
    errors.push(fieldError('confirmed', 'Confirmation must be a boolean.'));
  }
  if (errors.length > 0) {
    throwValidationError(errors);
  }
  return { toolCallId, toolName, confirmed: confirmed.value };
}

export function validateConversationQuery(input) {
  const errors = [];
  const { page, limit } = validatePageParams(input, errors, { defaultLimit: 20 });
  if (errors.length > 0) {
    throwValidationError(errors);
  }
  return { page, limit };
}

export function validateRenameConversation(input) {
  const errors = [];
  const title = validateOptionalLine(input?.title, 'title', MAX_CONVERSATION_TITLE, errors);
  if (title === null || title === undefined || title.length === 0) {
    errors.push(fieldError('title', `Title must be 1-${MAX_CONVERSATION_TITLE} characters.`));
  }
  if (errors.length > 0) {
    throwValidationError(errors);
  }
  return { title };
}