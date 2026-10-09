/**
 * AI Tools Index
 *
 * Exports all read and write tools for the AI orchestrator.
 */

import { createReadTools } from './readToolsPart1.js';
import { createWriteTools } from './writeTools.js';
import createReadToolsPart2 from './readTools.js';

export function createAllTools(services) {
  const readToolsPart1 = createReadTools(services);
  const readToolsPart2 = createReadToolsPart2(services);
  const writeTools = createWriteTools(services);

  return {
    readTools: [...readToolsPart1, ...readToolsPart2],
    writeTools,
    allTools: [...readToolsPart1, ...readToolsPart2, ...writeTools],
  };
}

export { createReadTools } from './readToolsPart1.js';
export { createReadTools as createReadToolsPart2 } from './readTools.js';
export { createWriteTools } from './writeTools.js';
export { AITool, TOOL_CATEGORIES, createToolResult, createConfirmationPrompt } from './base.js';

export default createAllTools;