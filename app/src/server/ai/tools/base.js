/**
 * AI Tool Definitions
 *
 * Tools are the interface between the AI and the application's services.
 * Each tool has a name, description, input schema, and an execute function.
 * Tools call existing application services - they NEVER access Prisma directly.
 */

// Tool category constants
export const TOOL_CATEGORIES = {
  READ: 'read',
  WRITE: 'write',
};

/**
 * Base tool class that all tools extend.
 * Provides common functionality like authorization checks.
 */
export class AITool {
  constructor(config = {}) {
    this.name = config.name;
    this.description = config.description;
    this.parameters = config.parameters || { type: 'object', properties: {} };
    this.category = config.category || TOOL_CATEGORIES.READ;
    this.requiresConfirmation = config.requiresConfirmation || false;
    this.householdScoped = config.householdScoped !== false;
  }

  /**
   * Execute the tool with the given parameters.
   * @param {Object} params - Input parameters validated against this.parameters
   * @param {Object} context - Execution context { userId, householdId, householdRole }
   * @returns {Promise<Object>} Tool result
   */
  async execute(params, context) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Validate input parameters against the tool's schema.
   * @param {Object} params
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validate(params) {
    // Basic validation - in production, use a proper JSON Schema validator
    const errors = [];
    const required = this.parameters.required || [];

    for (const field of required) {
      if (!(field in params) || params[field] === undefined || params[field] === null) {
        errors.push(`Missing required parameter: ${field}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get the tool definition for the AI model (OpenAI function calling format).
   * @returns {Object}
   */
  getDefinition() {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

/**
 * Confirmation prompt for write operations.
 * The AI must present this to the user and wait for explicit confirmation.
 */
export function createConfirmationPrompt(toolName, actionDescription, params) {
  return {
    tool: toolName,
    action: actionDescription,
    params,
    message: `I can ${actionDescription.toLowerCase()}. ${formatParamsForConfirmation(params)} Confirm?`,
  };
}

function formatParamsForConfirmation(params) {
  if (!params || Object.keys(params).length === 0) {
    return '';
  }
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      parts.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  return parts.length > 0 ? `Details: ${parts.join(', ')}` : '';
}

/**
 * Tool result wrapper for consistent formatting.
 */
export function createToolResult({ success, data, error, requiresConfirmation, confirmationPrompt }) {
  return {
    success,
    data,
    error,
    requiresConfirmation: !!requiresConfirmation,
    confirmationPrompt,
  };
}