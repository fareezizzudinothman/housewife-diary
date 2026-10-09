/**
 * AI Provider Abstraction
 *
 * Defines the interface that all AI providers must implement.
 * This allows the application to switch between providers (OpenAI, Anthropic, etc.)
 * without changing the orchestration logic.
 */

export class AIProviderError extends Error {
  constructor(message, { code, status, details } = {}) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const AIProviderErrorCodes = Object.freeze({
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  CONTEXT_TOO_LONG: 'CONTEXT_TOO_LONG',
  INVALID_REQUEST: 'INVALID_REQUEST',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

export class AIProvider {
  /**
   * Generate a response from the AI model.
   * @param {Object} params
   * @param {Array} params.messages - Array of message objects { role, content }
   * @param {Array} [params.tools] - Available tools for the model to call
   * @param {Object} [params.options] - Provider-specific options (temperature, maxTokens, etc.)
   * @returns {Promise<{ content: string, toolCalls?: Array, usage?: Object }>}
   */
  async generateResponse({ messages, tools, options = {} }) {
    throw new Error('generateResponse() must be implemented by provider');
  }

  /**
   * Generate a structured response (JSON) from the AI model.
   * @param {Object} params
   * @param {Array} params.messages - Array of message objects { role, content }
   * @param {Object} params.schema - JSON schema for the response
   * @param {Object} [params.options] - Provider-specific options
   * @returns {Promise<Object>} Parsed JSON response
   */
  async generateStructuredResponse({ messages, schema, options = {} }) {
    throw new Error('generateStructuredResponse() must be implemented by provider');
  }

  /**
   * Get the provider name for logging/debugging.
   * @returns {string}
   */
  getName() {
    throw new Error('getName() must be implemented by provider');
  }

  /**
   * Check if the provider is available/configured.
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    throw new Error('isAvailable() must be implemented by provider');
  }
}