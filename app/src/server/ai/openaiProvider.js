/**
 * OpenAI Provider Implementation
 *
 * Implements the AIProvider interface using OpenAI's API.
 * Requires OPENAI_API_KEY environment variable.
 */

import OpenAI from 'openai';
import { AIProvider, AIProviderError, AIProviderErrorCodes } from './providers.js';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.3;

export class OpenAIProvider extends AIProvider {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.model = config.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;
    this.maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
    this.temperature = config.temperature ?? DEFAULT_TEMPERATURE;
    this.timeout = config.timeout || 30000; // 30 seconds default
    this.organization = config.organization || process.env.OPENAI_ORGANIZATION;

    this.client = null;
    if (this.apiKey) {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        organization: this.organization,
        timeout: this.timeout,
        maxRetries: 2,
      });
    }
  }

  getName() {
    return 'openai';
  }

  async isAvailable() {
    if (!this.apiKey || !this.client) {
      return false;
    }
    try {
      // Quick health check - list models (lightweight)
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  async generateResponse({ messages, tools, options = {} }) {
    if (!this.client) {
      throw new AIProviderError('OpenAI provider not configured. Set OPENAI_API_KEY.', {
        code: AIProviderErrorCodes.AUTHENTICATION_FAILED,
        status: 503,
      });
    }

    try {
      const requestParams = {
        model: options.model || this.model,
        messages: this._normalizeMessages(messages),
        temperature: options.temperature ?? this.temperature,
        max_tokens: options.maxTokens || this.maxTokens,
      };

      if (tools && tools.length > 0) {
        requestParams.tools = this._formatTools(tools);
        requestParams.tool_choice = options.toolChoice || 'auto';
      }

      const response = await this.client.chat.completions.create(requestParams);

      const choice = response.choices[0];
      if (!choice) {
        throw new AIProviderError('No response from OpenAI', {
          code: AIProviderErrorCodes.INTERNAL_ERROR,
        });
      }

      const result = {
        content: choice.message.content || '',
        toolCalls: choice.message.tool_calls?.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        })) || [],
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
      };

      return result;
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }
      return this._handleOpenAIError(error);
    }
  }

  async generateStructuredResponse({ messages, schema, options = {} }) {
    if (!this.client) {
      throw new AIProviderError('OpenAI provider not configured. Set OPENAI_API_KEY.', {
        code: AIProviderErrorCodes.AUTHENTICATION_FAILED,
        status: 503,
      });
    }

    try {
      // Use JSON mode for structured output
      const response = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: this._normalizeMessages(messages),
        temperature: options.temperature ?? 0.1, // Low temperature for structured output
        max_tokens: options.maxTokens || this.maxTokens,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new AIProviderError('No response from OpenAI', {
          code: AIProviderErrorCodes.INTERNAL_ERROR,
        });
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        throw new AIProviderError('Failed to parse structured response', {
          code: AIProviderErrorCodes.INTERNAL_ERROR,
          details: [content],
        });
      }

      // Validate against schema if provided
      if (schema) {
        const validation = this._validateAgainstSchema(parsed, schema);
        if (!validation.valid) {
          throw new AIProviderError('Response does not match schema', {
            code: AIProviderErrorCodes.INVALID_REQUEST,
            details: validation.errors,
          });
        }
      }

      return parsed;
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }
      return this._handleOpenAIError(error);
    }
  }

  _normalizeMessages(messages) {
    return messages.map(m => ({
      role: m.role,
      content: m.content,
      ...(m.name && { name: m.name }),
    }));
  }

  _formatTools(tools) {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  _validateAgainstSchema(data, schema) {
    // Simple schema validation - in production, use a proper validator like ajv
    const required = schema.required || [];
    const errors = [];

    for (const field of required) {
      if (!(field in data)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  _handleOpenAIError(error) {
    // Handle common OpenAI error types
    if (error.status === 401) {
      throw new AIProviderError('Invalid OpenAI API key', {
        code: AIProviderErrorCodes.AUTHENTICATION_FAILED,
        status: 401,
      });
    }
    if (error.status === 429) {
      throw new AIProviderError('Rate limit exceeded', {
        code: AIProviderErrorCodes.RATE_LIMITED,
        status: 429,
      });
    }
    if (error.status === 400 && error.message?.includes('context length')) {
      throw new AIProviderError('Conversation too long for model context', {
        code: AIProviderErrorCodes.CONTEXT_TOO_LONG,
        status: 400,
      });
    }
    if (error.status >= 500) {
      throw new AIProviderError('OpenAI service unavailable', {
        code: AIProviderErrorCodes.PROVIDER_UNAVAILABLE,
        status: 503,
      });
    }
    throw new AIProviderError(`OpenAI error: ${error.message}`, {
      code: AIProviderErrorCodes.INTERNAL_ERROR,
      status: error.status || 500,
      details: [error.message],
    });
  }
}

export default OpenAIProvider;