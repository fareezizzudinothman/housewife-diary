/**
 * Read Tools (Part 2)
 *
 * More read tools for inventory, finance, family, home, documents, notes, ideas, notifications.
 */

import { AITool, TOOL_CATEGORIES, createToolResult } from './base.js';

/**
 * Get inventory items with filters
 */
export class GetInventoryTool extends AITool {
  constructor(inventoryService) {
    super({
      name: 'get_inventory',
      description: 'Get inventory items with optional filters (category, location, stock status, expiry).',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category' },
          location: { type: 'string', description: 'Filter by location' },
          stock: { type: 'string', enum: ['in_stock', 'low_stock', 'out_of_stock', 'expiring_soon', 'expired', 'none'], description: 'Filter by stock/expiry status' },
          search: { type: 'string', description: 'Search by name' },
        },
        required: [],
      },
      category: TOOL_CATEGORIES.READ,
    });
    this.inventoryService = inventoryService;
  }

  async execute(params, context) {
    try {
      const items = await this.inventoryService.getItems(context.householdId, params);
      return createToolResult({ success: true, data: items });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Get finance summary (accounts, budgets, bills, transactions)
 */
export class GetFinanceSummaryTool extends AITool {
  constructor(financeService) {
    super({
      name: 'get_finance_summary',
      description: 'Get household finance summary including accounts, budgets, bills, and recent transactions.',
      parameters: {
        type: 'object',
        properties: {
          includeTransactions: { type: 'boolean', default: false, description: 'Include recent transactions' },
        },
        required: [],
      },
      category: TOOL_CATEGORIES.READ,
    });
    this.financeService = financeService;
  }

  async execute(params, context) {
    try {
      const summary = await this.financeService.getDashboardFinance({
        user: { id: context.userId },
        householdId: context.householdId,
      });
      return createToolResult({ success: true, data: summary });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Get family members and events
 */
export class GetFamilyTool extends AITool {
  constructor(familyService) {
    super({
      name: 'get_family',
      description: 'Get family members and upcoming events/birthdays.',
      parameters: {
        type: 'object',
        properties: {
          includeArchived: { type: 'boolean', default: false },
        },
        required: [],
      },
      category: TOOL_CATEGORIES.READ,
    });
    this.familyService = familyService;
  }

  async execute(params, context) {
    try {
      const [members, events] = await Promise.all([
        this.familyService.listMembers(context.householdId, params),
        this.familyService.listEvents(context.householdId, {}),
      ]);
      return createToolResult({ success: true, data: { members, events } });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Get home management data (rooms, cleaning, laundry, maintenance)
 */
export class GetHomeTool extends AITool {
  constructor(homeService) {
    super({
      name: 'get_home',
      description: 'Get home management overview: rooms, cleaning schedules, laundry, maintenance.',
      parameters: { type: 'object', properties: {}, required: [] },
      category: TOOL_CATEGORIES.READ,
    });
    this.homeService = homeService;
  }

  async execute(params, context) {
    try {
      const [rooms, cleaning, laundry, maintenance] = await Promise.all([
        this.homeService.listRooms(context.householdId, {}),
        this.homeService.listCleaning(context.householdId, {}),
        this.homeService.listLaundry(context.householdId, {}),
        this.homeService.listMaintenance(context.householdId, {}),
      ]);
      return createToolResult({ success: true, data: { rooms, cleaning, laundry, maintenance } });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Get documents metadata
 */
export class GetDocumentsTool extends AITool {
  constructor(documentsService) {
    super({
      name: 'get_documents',
      description: 'Get document metadata (title, category, expiry, size). File content is not included.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category' },
          status: { type: 'string', enum: ['ACTIVE', 'EXPIRING_SOON', 'EXPIRED'] },
        },
        required: [],
      },
      category: TOOL_CATEGORIES.READ,
    });
    this.documentsService = documentsService;
  }

  async execute(params, context) {
    try {
      const documents = await this.documentsService.listDocuments(context.householdId, params);
      return createToolResult({ success: true, data: documents });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Get notes
 */
export class GetNotesTool extends AITool {
  constructor(notesService) {
    super({
      name: 'get_notes',
      description: 'Get notes with optional filters (search, category, tag, pinned, archived).',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Search in title and content' },
          category: { type: 'string', description: 'Filter by category' },
          tag: { type: 'string', description: 'Filter by tag' },
          pinned: { type: 'boolean', description: 'Filter by pinned status' },
          archived: { type: 'boolean', description: 'Filter by archived status' },
        },
        required: [],
      },
      category: TOOL_CATEGORIES.READ,
    });
    this.notesService = notesService;
  }

  async execute(params, context) {
    try {
      const notes = await this.notesService.listNotes(context.householdId, context.userId, params);
      return createToolResult({ success: true, data: notes });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Get ideas
 */
export class GetIdeasTool extends AITool {
  constructor(ideasService) {
    super({
      name: 'get_ideas',
      description: 'Get ideas with optional filters (search, category, status).',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Search in title and description' },
          category: { type: 'string', description: 'Filter by category' },
          status: { type: 'string', enum: ['IDEA', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
        },
        required: [],
      },
      category: TOOL_CATEGORIES.READ,
    });
    this.ideasService = ideasService;
  }

  async execute(params, context) {
    try {
      const ideas = await this.ideasService.listIdeas(context.householdId, params);
      return createToolResult({ success: true, data: ideas });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Get notifications
 */
export class GetNotificationsTool extends AITool {
  constructor(notificationService) {
    super({
      name: 'get_notifications',
      description: 'Get user notifications with filters (unread only, include archived).',
      parameters: {
        type: 'object',
        properties: {
          unreadOnly: { type: 'boolean', default: false },
          includeArchived: { type: 'boolean', default: false },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        required: [],
      },
      category: TOOL_CATEGORIES.READ,
    });
    this.notificationService = notificationService;
  }

  async execute(params, context) {
    try {
      const notifications = await this.notificationService.listNotifications(context.userId, params);
      return createToolResult({ success: true, data: notifications });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Get unread notification count
 */
export class GetUnreadNotificationCountTool extends AITool {
  constructor(notificationService) {
    super({
      name: 'get_unread_notification_count',
      description: 'Get the count of unread notifications for the current user.',
      parameters: { type: 'object', properties: {}, required: [] },
      category: TOOL_CATEGORIES.READ,
    });
    this.notificationService = notificationService;
  }

  async execute(params, context) {
    try {
      const count = await this.notificationService.getUnreadCount(context.userId);
      return createToolResult({ success: true, data: { count } });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Factory function to create all read tools (Part 2) with their service dependencies
 */
export function createReadTools(services) {
  return [
    new GetInventoryTool(services.inventoryService),
    new GetFinanceSummaryTool(services.financeService),
    new GetFamilyTool(services.familyService),
    new GetHomeTool(services.homeService),
    new GetDocumentsTool(services.documentsService),
    new GetNotesTool(services.notesService),
    new GetIdeasTool(services.ideasService),
    new GetNotificationsTool(services.notificationService),
    new GetUnreadNotificationCountTool(services.notificationService),
  ];
}

export default createReadTools;