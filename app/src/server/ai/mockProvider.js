/**
 * Mock AI Provider for Testing
 *
 * Implements the AIProvider interface with deterministic responses
 * for E2E and integration testing without requiring an OpenAI API key.
 */

import { AIProvider, AIProviderError, AIProviderErrorCodes } from './providers.js';

export class MockAIProvider extends AIProvider {
  constructor(config = {}) {
    super();
    this.responses = config.responses || [];
    this.responseIndex = 0;
    this.isAvailableResult = config.isAvailable !== false;
    this.shouldTimeout = config.shouldTimeout || false;
    this.latency = config.latency || 0;
  }

  getName() {
    return 'mock';
  }

  async isAvailable() {
    return this.isAvailableResult;
  }

  async generateResponse({ messages, tools, options = {} }) {
    if (this.shouldTimeout) {
      await new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Provider timeout')), 100)
      );
    }

    if (this.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latency));
    }

    // Get the next configured response or return a default
    const response = this.responses[this.responseIndex % this.responses.length];
    this.responseIndex++;

    if (response instanceof Error) {
      throw response;
    }

    // If response is a function, call it with the messages and tools
    if (typeof response === 'function') {
      return response(messages, tools, options);
    }

    // Return the configured response
    return response;
  }

  async generateStructuredResponse({ messages, schema, options = {} }) {
    if (this.shouldTimeout) {
      await new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Provider timeout')), 100)
      );
    }

    const response = this.responses[this.responseIndex % this.responses.length];
    this.responseIndex++;

    if (response instanceof Error) {
      throw response;
    }

    if (typeof response === 'function') {
      return response(messages, schema, options);
    }

    // Default structured response
    return response;
  }

  /**
   * Add a response to the queue
   */
  addResponse(response) {
    this.responses.push(response);
  }

  /**
   * Clear all responses
   */
  clearResponses() {
    this.responses = [];
    this.responseIndex = 0;
  }

  /**
   * Set whether the provider should report as available
   */
  setAvailable(available) {
    this.isAvailableResult = available;
  }

  /**
   * Set whether the provider should timeout
   */
  setTimeout(shouldTimeout) {
    this.shouldTimeout = shouldTimeout;
  }

  /**
   * Set artificial latency
   */
  setLatency(latency) {
    this.latency = latency;
  }
}

/**
 * Create a mock provider with a simple text response
 */
export function createMockProviderWithResponse(content, toolCalls = []) {
  return new MockAIProvider({
    responses: [{
      content,
      toolCalls,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    }]
  });
}

/**
 * Create a mock provider that simulates a tool call requiring confirmation
 */
export function createMockProviderWithConfirmation(toolName, toolArgs, confirmationMessage) {
  return new MockAIProvider({
    responses: [{
      content: '',
      toolCalls: [{
        id: `call_${Date.now()}`,
        name: toolName,
        arguments: toolArgs
      }],
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    }]
  });
}

/**
 * Create a mock provider that simulates a sequence of responses
 * (e.g., first a tool call, then a final response after confirmation)
 */
export function createMockProviderWithSequence(...responses) {
  return new MockAIProvider({ responses });
}

/**
 * Create a mock provider that returns an error
 */
export function createMockProviderWithError(error) {
  return new MockAIProvider({ responses: [error] });
}

export default MockAIProvider;