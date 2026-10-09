/**
 * AI Initialization
 *
 * Sets up the AI provider, tools, orchestrator, and service.
 * This module creates all AI components with their dependencies.
 */

import { OpenAIProvider } from '../ai/openaiProvider.js';
import { createAllTools } from '../ai/tools/index.js';
import { AIOrchestrator } from '../ai/orchestrator.js';
import { AIService } from './aiService.js';
import * as aiRepository from '../repositories/aiRepository.js';

let aiServiceInstance = null;
let orchestratorInstance = null;
let providerInstance = null;

/**
 * Initialize all AI components
 */
export function initializeAI(services) {
  // Create provider
  providerInstance = new OpenAIProvider();

  // Create tools
  const { readTools, writeTools } = createAllTools(services);

  // Create orchestrator
  orchestratorInstance = new AIOrchestrator({
    provider: providerInstance,
    readTools,
    services,
    conversationRepository: aiRepository,
    messageRepository: aiRepository,
  });

  // Create service
  aiServiceInstance = new AIService({ orchestrator: orchestratorInstance });

  return {
    provider: providerInstance,
    orchestrator: orchestratorInstance,
    service: aiServiceInstance,
  };
}

/**
 * Get the AI service instance (initializes if needed)
 */
export function getAIService(services) {
  if (!aiServiceInstance) {
    return initializeAI(services).service;
  }
  return aiServiceInstance;
}

/**
 * Get the AI orchestrator instance
 */
export function getAIOrchestrator() {
  return orchestratorInstance;
}

/**
 * Get the AI provider instance
 */
export function getAIProvider() {
  return providerInstance;
}

/**
 * Check if AI provider is available
 */
export async function isAIAvailable() {
  if (!providerInstance) {
    return false;
  }
  return providerInstance.isAvailable();
}

// Export a function that can be used by controllers to get the service
export default function createAIService(services) {
  return getAIService(services);
}