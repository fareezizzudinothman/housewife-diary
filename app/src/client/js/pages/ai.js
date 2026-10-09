/**
 * AI Assistant Page
 */

import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { setStatus, describeError } from '../utils/forms.js';
import { formatDate } from '../utils/dates.js';
import {
  listConversations,
  createConversation,
  getConversation,
  deleteConversation,
  renameConversation,
  sendMessage,
  confirmAction,
  getProviderStatus,
} from '../api/ai.js';

const SUGGESTIONS = [
  'What tasks are due today?',
  'Show me this week\'s meal plan',
  'What\'s low in inventory?',
  'Create a task to buy groceries',
  'Add a family event for mom\'s birthday',
  'Show my upcoming bills',
  'What notes do I have about recipes?',
];

const state = {
  conversations: [],
  currentConversationId: null,
  currentConversationTitle: null,
  messages: [],
  isLoading: false,
  isStreaming: false,
  pendingConfirmation: null,
  page: 1,
  limit: 20,
};

const elements = {};

function getElements() {
  elements.aiAssistant = document.querySelector('[data-ai-assistant]');
  elements.conversationList = document.querySelector('[data-conversations]');
  elements.emptyState = document.querySelector('[data-empty-state]');
  elements.newConversationBtn = document.querySelector('[data-new-conversation]');
  elements.newConversationEmptyBtn = document.querySelector('[data-new-conversation-empty]');
  elements.chatHeader = document.querySelector('[data-chat-header]');
  elements.chatTitle = document.querySelector('[data-chat-title]');
  elements.renameChatBtn = document.querySelector('[data-rename-chat]');
  elements.deleteChatBtn = document.querySelector('[data-delete-chat]');
  elements.welcome = document.querySelector('[data-welcome]');
  elements.suggestions = document.querySelector('[data-suggestions]');
  elements.messages = document.querySelector('[data-messages]');
  elements.inputArea = document.querySelector('[data-input-area]');
  elements.chatStatus = document.querySelector('[data-chat-status]');
  elements.chatForm = document.querySelector('[data-chat-form]');
  elements.messageInput = document.querySelector('[data-message-input]');
  elements.sendBtn = document.querySelector('[data-send-btn]');
  elements.loading = document.querySelector('[data-loading]');
  elements.error = document.querySelector('[data-error]');
  elements.errorMessage = document.querySelector('[data-error-message]');
  elements.retryBtn = document.querySelector('[data-retry]');
  elements.confirmationModal = document.querySelector('[data-confirmation-modal]');
  elements.confirmBackdrop = document.querySelector('[data-confirm-backdrop]');
  elements.confirmMessage = document.querySelector('[data-confirm-message]');
  elements.confirmDetails = document.querySelector('[data-confirm-details]');
  elements.confirmCancel = document.querySelector('[data-confirm-cancel]');
  elements.confirmOk = document.querySelector('[data-confirm-ok]');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMessageContent(content) {
  // Simple markdown-like formatting
  return content
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function renderConversationList() {
  if (!elements.conversationList) return;

  if (state.conversations.length === 0) {
    elements.conversationList.innerHTML = '';
    if (elements.emptyState) elements.emptyState.hidden = false;
    return;
  }

  if (elements.emptyState) elements.emptyState.hidden = true;

  elements.conversationList.innerHTML = state.conversations.map(conv => `
    <button
      type="button"
      class="conversation-item${conv.id === state.currentConversationId ? ' conversation-item--active' : ''}"
      data-conversation-id="${conv.id}"
      role="listitem"
    >
      <div class="conversation-item__title">${escapeHtml(conv.title)}</div>
      <div class="conversation-item__meta">
        <span>${conv.messageCount} message${conv.messageCount !== 1 ? 's' : ''}</span>
        <time>${formatDate(conv.lastMessageAt)}</time>
      </div>
    </button>
  `).join('');

  // Add click handlers
  elements.conversationList.querySelectorAll('[data-conversation-id]').forEach(btn => {
    btn.addEventListener('click', () => loadConversation(btn.dataset.conversationId));
  });
}

function renderSuggestions() {
  if (!elements.suggestions) return;
  elements.suggestions.innerHTML = SUGGESTIONS.map(s => `
    <button type="button" class="btn btn--ghost btn--small suggestion-chip" data-suggestion="${escapeHtml(s)}">${escapeHtml(s)}</button>
  `).join('');

  elements.suggestions.querySelectorAll('[data-suggestion]').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.messageInput.value = btn.dataset.suggestion;
      elements.messageInput.focus();
      updateSendButton();
    });
  });
}

function renderMessages() {
  if (!elements.messages) return;

  if (state.messages.length === 0) {
    elements.messages.innerHTML = '';
    return;
  }

  elements.messages.innerHTML = state.messages.map(msg => {
    const isUser = msg.role === 'user';
    const isTool = msg.role === 'tool';
    const isSystem = msg.role === 'system';

    if (isSystem) return '';

    let content = formatMessageContent(msg.content);
    let meta = '';

    if (isTool) {
      try {
        const data = JSON.parse(msg.content);
        if (data.requiresConfirmation) {
          content = `<div class="message-confirmation">${escapeHtml(data.confirmationPrompt.message)}</div>`;
        } else if (data.success) {
          content = `<div class="message-tool-result success">${icon('check-circle', { size: 'sm' })} Action completed`;
          if (data.data) {
            content += `<pre>${escapeHtml(JSON.stringify(data.data, null, 2))}</pre>`;
          }
          content += '</div>';
        } else {
          content = `<div class="message-tool-result error">${icon('alert', { size: 'sm' })} Action failed: ${escapeHtml(data.error || 'Unknown error')}</div>`;
        }
      } catch {
        content = `<div class="message-tool-result">${escapeHtml(msg.content)}</div>`;
      }
    }

    const time = msg.createdAt ? formatDate(msg.createdAt) : '';

    return `
      <div class="message message--${isUser ? 'user' : 'assistant'}" data-message-id="${msg.id}">
        <div class="message__avatar">${icon(isUser ? 'user' : 'bot', { size: 'sm' })}</div>
        <div class="message__content">
          <div class="message__bubble">${content}</div>
          <div class="message__meta">${time}</div>
        </div>
      </div>
    `;
  }).join('');

  scrollToBottom();
}

function renderConfirmationPrompt(confirmation) {
  if (!elements.confirmationModal) return;

  elements.confirmMessage.textContent = confirmation.confirmationPrompt.message;

  if (confirmation.confirmationPrompt.preview) {
    elements.confirmDetails.hidden = false;
    elements.confirmDetails.innerHTML = '<h4>Details:</h4><pre>' + escapeHtml(JSON.stringify(confirmation.confirmationPrompt.preview, null, 2)) + '</pre>';
  } else {
    elements.confirmDetails.hidden = true;
    elements.confirmDetails.innerHTML = '';
  }

  elements.confirmationModal.hidden = false;
  elements.confirmationModal.dataset.toolCallId = confirmation.toolCallId;
  elements.confirmationModal.dataset.toolName = confirmation.toolName;
}

function hideConfirmationModal() {
  if (elements.confirmationModal) {
    elements.confirmationModal.hidden = true;
    delete elements.confirmationModal.dataset.toolCallId;
    delete elements.confirmationModal.dataset.toolName;
  }
}

function showChatArea() {
  elements.welcome.hidden = true;
  elements.chatHeader.hidden = false;
  elements.inputArea.hidden = false;
  elements.messages.hidden = false;
  if (elements.chatTitle) elements.chatTitle.textContent = state.currentConversationTitle || 'Conversation';
}

function showWelcome() {
  elements.welcome.hidden = false;
  elements.chatHeader.hidden = true;
  elements.inputArea.hidden = true;
  elements.messages.hidden = true;
}

function showLoading(show) {
  elements.loading.hidden = !show;
  elements.chatForm.hidden = show;
  state.isLoading = show;
  updateSendButton();
}

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.error.hidden = false;
  elements.loading.hidden = true;
  elements.chatForm.hidden = false;
  state.isLoading = false;
  updateSendButton();
}

function hideError() {
  elements.error.hidden = true;
}

function updateSendButton() {
  const hasText = elements.messageInput.value.trim().length > 0;
  elements.sendBtn.disabled = !hasText || state.isLoading;
}

function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

function scrollToBottom() {
  if (elements.messages) {
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }
}

async function loadConversations() {
  try {
    setStatus(elements.conversationList, 'loading', 'Loading conversations…');
    const result = await listConversations({ page: state.page, limit: state.limit });
    state.conversations = result.items || [];
    renderConversationList();
    setStatus(elements.conversationList, 'ok', '');
  } catch (error) {
    console.error('[AI] Failed to load conversations:', error);
    setStatus(elements.conversationList, 'error', 'Failed to load conversations');
  }
}

async function loadConversation(id) {
  try {
    showLoading(true);
    hideError();

    const result = await getConversation(id);
    state.currentConversationId = result.conversation.id;
    state.currentConversationTitle = result.conversation.title;
    state.messages = result.conversation.messages || [];

    showChatArea();
    renderMessages();
    updateSendButton();

    // Update active conversation in sidebar
    renderConversationList();
  } catch (error) {
    console.error('[AI] Failed to load conversation:', error);
    showError('Failed to load conversation. ' + describeError(error));
  } finally {
    showLoading(false);
  }
}

async function handleNewConversation() {
  try {
    showLoading(true);
    const result = await createConversation('New Conversation');
    const conversationId = result.conversation.id;
    await loadConversations();
    await loadConversation(conversationId);
  } catch (error) {
    console.error('[AI] Failed to create conversation:', error);
    showError('Failed to create conversation. ' + describeError(error));
  } finally {
    showLoading(false);
  }
}

async function handleSendMessage() {
  const content = elements.messageInput.value.trim();
  if (!content || state.isLoading) return;

  // Add user message optimistically
  const userMessage = {
    id: 'temp-' + Date.now(),
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
  };
  state.messages.push(userMessage);
  renderMessages();

  // Clear input
  elements.messageInput.value = '';
  autoResizeTextarea(elements.messageInput);
  updateSendButton();

  try {
    showLoading(true);
    hideError();

    const result = await sendMessage(state.currentConversationId, content);

    if (result.type === 'confirmation_required') {
      // Remove the optimistic user message and add the real one from server
      state.messages = state.messages.filter(m => m.id !== userMessage.id);
      // The confirmation will be handled by showing the modal
      state.pendingConfirmation = result.confirmation;
      renderConfirmationPrompt(result.confirmation);
    } else {
      // Add assistant message
      state.messages.push({
        id: 'assistant-' + Date.now(),
        role: 'assistant',
        content: result.message.content,
        createdAt: new Date().toISOString(),
      });
      renderMessages();
    }

    // Refresh conversation list to update message counts
    await loadConversations();
  } catch (error) {
    console.error('[AI] Failed to send message:', error);
    showError('Failed to send message. ' + describeError(error));
    // Remove optimistic message on error
    state.messages = state.messages.filter(m => m.id !== userMessage.id);
    renderMessages();
  } finally {
    showLoading(false);
  }
}

async function handleConfirmAction(confirmed) {
  if (!state.pendingConfirmation) return;

  const toolCallId = elements.confirmationModal.dataset.toolCallId;
  const toolName = elements.confirmationModal.dataset.toolName;

  try {
    showLoading(true);
    hideConfirmationModal();

    const result = await confirmAction(
      state.currentConversationId,
      toolCallId,
      toolName,
      confirmed
    );

    if (result.type === 'cancelled') {
      toast('Action cancelled');
    } else {
      state.messages.push({
        id: 'assistant-' + Date.now(),
        role: 'assistant',
        content: result.message.content,
        createdAt: new Date().toISOString(),
      });
      renderMessages();
    }

    state.pendingConfirmation = null;
    await loadConversations();
  } catch (error) {
    console.error('[AI] Failed to confirm action:', error);
    showError('Failed to confirm action. ' + describeError(error));
  } finally {
    showLoading(false);
  }
}

async function handleRenameConversation() {
  if (!state.currentConversationId) return;

  const newTitle = prompt('Enter new title:', state.currentConversationTitle);
  if (!newTitle || newTitle.trim() === '') return;

  try {
    await renameConversation(state.currentConversationId, newTitle.trim());
    state.currentConversationTitle = newTitle.trim();
    if (elements.chatTitle) elements.chatTitle.textContent = state.currentConversationTitle;
    await loadConversations();
    toast('Conversation renamed');
  } catch (error) {
    console.error('[AI] Failed to rename conversation:', error);
    toast('Failed to rename conversation: ' + describeError(error), 'error');
  }
}

async function handleDeleteConversation() {
  if (!state.currentConversationId) return;

  const confirmed = await confirmDialog(
    'Delete Conversation',
    `Are you sure you want to delete "${state.currentConversationTitle}"? This cannot be undone.`
  );

  if (!confirmed) return;

  try {
    await deleteConversation(state.currentConversationId);
    state.currentConversationId = null;
    state.currentConversationTitle = null;
    state.messages = [];
    showWelcome();
    await loadConversations();
    toast('Conversation deleted');
  } catch (error) {
    console.error('[AI] Failed to delete conversation:', error);
    toast('Failed to delete conversation: ' + describeError(error), 'error');
  }
}

async function checkProviderStatus() {
  try {
    const result = await getProviderStatus();
    if (!result.available) {
      showError('AI provider is not available. Please check your configuration.');
      elements.chatForm.hidden = true;
    }
  } catch (error) {
    console.error('[AI] Failed to check provider status:', error);
  }
}

function wireEvents() {
  // New conversation buttons
  elements.newConversationBtn?.addEventListener('click', handleNewConversation);
  elements.newConversationEmptyBtn?.addEventListener('click', handleNewConversation);

  // Chat header actions
  elements.renameChatBtn?.addEventListener('click', handleRenameConversation);
  elements.deleteChatBtn?.addEventListener('click', handleDeleteConversation);

  // Message input
  elements.messageInput?.addEventListener('input', () => {
    autoResizeTextarea(elements.messageInput);
    updateSendButton();
  });

  elements.messageInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Send button
  elements.chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSendMessage();
  });

  // Retry button
  elements.retryBtn?.addEventListener('click', () => {
    hideError();
    handleSendMessage();
  });

  // Confirmation modal
  elements.confirmCancel?.addEventListener('click', () => handleConfirmAction(false));
  elements.confirmOk?.addEventListener('click', () => handleConfirmAction(true));
  elements.confirmBackdrop?.addEventListener('click', () => handleConfirmAction(false));

  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.confirmationModal && !elements.confirmationModal.hidden) {
      handleConfirmAction(false);
    }
  });
}

export async function initAI() {
  await initShell({ withUser: true });
  getElements();
  wireEvents();
  renderSuggestions();
  await loadConversations();
  await checkProviderStatus();

  // Auto-select first conversation if exists
  if (state.conversations.length > 0 && !state.currentConversationId) {
    await loadConversation(state.conversations[0].id);
  } else if (state.conversations.length === 0) {
    showWelcome();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAI);
} else {
  initAI();
}