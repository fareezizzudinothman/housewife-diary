/**
 * Read Tools (Part 1)
 *
 * Read tools for dashboard, tasks, calendar, meals, shopping.
 */

import { AITool, TOOL_CATEGORIES, createToolResult } from './base.js';

/**
 * Get dashboard overview
 */
export class GetDashboardTool extends AITool {
  constructor(dashboardService) {
    super({
      name: 'get_dashboard',
      description: 'Get the household dashboard overview including tasks, meals, inventory alerts, finance summary, and upcoming events.',
      parameters: { type: 'object', properties: {}, required: [] },
      category: TOOL_CATEGORIES.READ,
    });
    this.dashboardService = dashboardService;
  }

  async execute(params, context) {
    try {
      const dashboard = await this.dashboardService.getDashboard({
        user: { id: context.userId, timezone: context.timezone },
        householdId: context.householdId,
      });
      return createToolResult({ success: true, data: dashboard });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Get tasks with filters
 */
export class GetTasksTool extends AITool {
  constructor(taskService) {
    super({
      name: 'get_tasks',
      description: 'Get tasks with optional filters (status, priority, assignee, category, date range, search).',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], description: 'Filter by status' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], description: 'Filter by priority' },
          assignedToId: { type: 'string', description: 'Filter by assignee user ID' },
          assignedFamilyMemberId: { type: 'string', description: 'Filter by family member ID' },
          categoryId: { type: 'string', description: 'Filter by category ID' },
          from: { type: 'string', format: 'date', description: 'Filter due from date (YYYY-MM-DD)' },
          to: { type: 'string', format: 'date', description: 'Filter due to date (YYYY-MM-DD)' },
          search: { type: 'string', description: 'Search in title and description' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        required: [],
      },
      category: TOOL_CATEGORIES.READ,
    });
    this.taskService = taskService;
  }

  async execute(params, context) {
    try {
      const query = {
        page: params.page || 1,
        limit: params.limit || 20,
        status: params.status,
        priority: params.priority,
        assignedToId: params.assignedToId,
        assignedFamilyMemberId: params.assignedFamilyMemberId,
        categoryId: params.categoryId,
        from: params.from,
        to: params.to,
        search: params.search,
      };
      const tasks = await this.taskService.listTasks({
        user: { id: context.userId, timezone: context.timezone },
        householdId: context.householdId,
        query,
      });
      return createToolResult({ success: true, data: tasks });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Get task categories
 */
export class GetTaskCategoriesTool extends AITool {
  constructor(taskService) {
    super({
      name: 'get_task_categories',
      description: 'Get all task categories for the household.',
      parameters: { type: 'object', properties: {}, required: [] },
      category: TOOL_CATEGORIES.READ,
    });
    this.taskService = taskService;
  }

  async execute(params, context) {
    try {
      const categories = await this.taskService.listMeta({ householdId: context.householdId });
      return createToolResult({ success: true, data: categories });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Get calendar events
 */
export class GetCalendarTool extends AITool {
  constructor(calendarService) {
    super({
      name: 'get_calendar',
      description: 'Get calendar events for a date range (includes tasks, meals, bills, family events, birthdays, maintenance).',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date', description: 'Start date (YYYY-MM-DD)' },
          to: { type: 'string', format: 'date', description: 'End date (YYYY-MM-DD)' },
        },
        required: [],
      },
      category: TOOL_CATEGORIES.READ,
    });
    this.calendarService = calendarService;
  }

  async execute(params, context) {
    try {
      const query = {
        from: params.from ? new Date(params.from) : null,
        to: params.to ? new Date(params.to) : null,
      };
      const events = await this.calendarService.listEvents({
        user: { id: context.userId, timezone: context.timezone },
        householdId: context.householdId,
        query,
      });
      return createToolResult({ success: true, data: events });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Get meal plan entries
 */
export class GetMealsTool extends AITool {
  constructor(mealService) {
    super({
      name: 'get_meals',
      description: 'Get meal plan entries for a date range.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date', description: 'Start date (YYYY-MM-DD)' },
          to: { type: 'string', format: 'date', description: 'End date (YYYY-MM-DD)' },
          mealType: { type: 'string', enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'], description: 'Filter by meal type' },
        },
        required: [],
      },
      category: TOOL_CATEGORIES.READ,
    });
    this.mealService = mealService;
  }

  async execute(params, context) {
    try {
      const query = {
        from: params.from ? new Date(params.from) : null,
        to: params.to ? new Date(params.to) : null,
        mealType: params.mealType,
      };
      const meals = await this.mealService.listMeals({
        user: { id: context.userId, timezone: context.timezone },
        householdId: context.householdId,
        query,
      });
      return createToolResult({ success: true, data: meals });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Get shopping lists and items
 */
export class GetShoppingTool extends AITool {
  constructor(shoppingService) {
    super({
      name: 'get_shopping',
      description: 'Get shopping lists and their items.',
      parameters: {
        type: 'object',
        properties: {
          listId: { type: 'string', description: 'Specific list ID to get items for' },
          archived: { type: 'boolean', description: 'Include archived lists' },
        },
        required: [],
      },
      category: TOOL_CATEGORIES.READ,
    });
    this.shoppingService = shoppingService;
  }

  async execute(params, context) {
    try {
      if (params.listId) {
        const items = await this.shoppingService.listItems({
          householdId: context.householdId,
          listId: params.listId,
          query: { page: 1, limit: 100 },
        });
        return createToolResult({ success: true, data: items });
      }

      const lists = await this.shoppingService.listLists({
        householdId: context.householdId,
        query: { page: 1, limit: 20, archived: params.archived },
      });
      return createToolResult({ success: true, data: lists });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Factory function to create all read tools with their service dependencies
 */
export function createReadTools(services) {
  return [
    new GetDashboardTool(services.dashboardService),
    new GetTasksTool(services.taskService),
    new GetTaskCategoriesTool(services.taskService),
    new GetCalendarTool(services.calendarService),
    new GetMealsTool(services.mealService),
    new GetShoppingTool(services.shoppingService),
  ];
}

export default createReadTools;