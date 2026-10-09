/**
 * AI Initialization
 *
 * Sets up the AI provider, tools, orchestrator, and service.
 * This module creates all AI components with their dependencies.
 */

import { OpenAIProvider } from '../ai/openaiProvider.js';
import { MockAIProvider } from '../ai/mockProvider.js';
import { createAllTools } from '../ai/tools/index.js';
import { AIOrchestrator } from '../ai/orchestrator.js';
import { AIService } from './aiService.js';
import * as aiRepository from '../repositories/aiRepository.js';

let aiServiceInstance = null;
let orchestratorInstance = null;
let providerInstance = null;

/**
 * Create the appropriate provider based on environment
 */
function createProvider() {
  // Check if we should use mock provider (for E2E testing)
  if (process.env.AI_MOCK_PROVIDER === 'true') {
    return new MockAIProvider({
      isAvailable: true,
      latency: 50, // Small latency to simulate real provider
    });
  }
  return new OpenAIProvider();
}

/**
 * Initialize all AI components with the appropriate provider
 */
export function initializeAI(services) {
  // Create provider based on environment
  providerInstance = createProvider();

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
 * Initialize AI components with a custom provider (for testing)
 */
export function initializeAIWithProvider(services, provider) {
  providerInstance = provider;

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
 * Initialize AI components with a mock provider (for E2E testing)
 */
export function initializeAIWithMockProvider(services, mockConfig = {}) {
  const provider = new MockAIProvider({ isAvailable: true, latency: 50, ...mockConfig });
  return initializeAIWithProvider(services, provider);
}

/**
 * Get the AI service instance (initializes with appropriate provider if needed)
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

/**
 * Reset AI instances (for testing)
 */
export function resetAI() {
  aiServiceInstance = null;
  orchestratorInstance = null;
  providerInstance = null;
}

// Export a function that can be used by controllers to get the service
export default function createAIService(services) {
  return getAIService(services);
}