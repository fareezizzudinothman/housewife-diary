/**
 * Write Tools
 *
 * Tools that modify data. All write tools require explicit user confirmation
 * before execution. They call existing application services - NEVER Prisma directly.
 */

import { AITool, TOOL_CATEGORIES, createToolResult, createConfirmationPrompt } from './base.js';

/**
 * Create a new task
 */
export class CreateTaskTool extends AITool {
  constructor(taskService) {
    super({
      name: 'create_task',
      description: 'Create a new task. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Optional task description' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM', description: 'Task priority' },
          dueDate: { type: 'string', format: 'date', description: 'Optional due date (YYYY-MM-DD)' },
          categoryId: { type: 'string', description: 'Optional category ID' },
          assignedToId: { type: 'string', description: 'Optional household member user ID to assign' },
          assignedFamilyMemberId: { type: 'string', description: 'Optional family member ID to assign' },
          recurrence: {
            type: 'object',
            description: 'Optional recurrence rule',
            properties: {
              frequency: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] },
              interval: { type: 'integer', minimum: 1, default: 1 },
              daysOfWeek: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
              endDate: { type: 'string', format: 'date' },
            },
            required: ['frequency'],
          },
        },
        required: ['title'],
      },
      category: TOOL_CATEGORIES.WRITE,
      requiresConfirmation: true,
    });
    this.taskService = taskService;
  }

  async execute(params, context) {
    try {
      const validation = this.validate(params);
      if (!validation.valid) {
        return createToolResult({ success: false, error: validation.errors.join(', ') });
      }

      const { title, description, priority, dueDate, categoryId, assignedToId, assignedFamilyMemberId, recurrence } = params;

      if (recurrence && !dueDate) {
        return createToolResult({ success: false, error: 'Due date is required for recurring tasks' });
      }

      const confirmation = createConfirmationPrompt(
        this.name,
        `Create task "${title}"`,
        { title, description, priority, dueDate, categoryId, assignedToId, assignedFamilyMemberId, recurrence }
      );

      return createToolResult({
        success: true,
        data: { message: 'Task ready to create', preview: { title, description, priority, dueDate, categoryId, assignedToId, assignedFamilyMemberId, recurrence } },
        requiresConfirmation: true,
        confirmationPrompt: confirmation,
      });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }

  async executeConfirmed(params, context) {
    try {
      const { title, description, priority, dueDate, categoryId, assignedToId, assignedFamilyMemberId, recurrence } = params;

      const data = {
        title,
        description,
        priority,
        dueDate,
        categoryId,
        assignedToId,
        assignedFamilyMemberId,
        recurrence,
      };

      const task = await this.taskService.createTask({
        user: { id: context.userId, timezone: context.timezone },
        householdId: context.householdId,
        data,
      });

      return createToolResult({ success: true, data: task });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Update an existing task
 */
export class UpdateTaskTool extends AITool {
  constructor(taskService) {
    super({
      name: 'update_task',
      description: 'Update an existing task. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID to update' },
          title: { type: 'string', description: 'New task title' },
          description: { type: 'string', description: 'New task description' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], description: 'New priority' },
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], description: 'New status' },
          dueDate: { type: 'string', format: 'date', description: 'New due date (YYYY-MM-DD)' },
          categoryId: { type: 'string', description: 'New category ID' },
          assignedToId: { type: 'string', description: 'New assignee user ID' },
          assignedFamilyMemberId: { type: 'string', description: 'New family member assignee ID' },
          recurrence: {
            type: 'object',
            description: 'New recurrence rule or null to remove',
            properties: {
              frequency: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] },
              interval: { type: 'integer', minimum: 1, default: 1 },
              daysOfWeek: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
              endDate: { type: 'string', format: 'date' },
            },
            required: ['frequency'],
          },
        },
        required: ['id'],
      },
      category: TOOL_CATEGORIES.WRITE,
      requiresConfirmation: true,
    });
    this.taskService = taskService;
  }

  async execute(params, context) {
    try {
      const validation = this.validate(params);
      if (!validation.valid) {
        return createToolResult({ success: false, error: validation.errors.join(', ') });
      }

      const { id, ...updates } = params;
      if (Object.keys(updates).length === 0) {
        return createToolResult({ success: false, error: 'No updates provided' });
      }

      const confirmation = createConfirmationPrompt(
        this.name,
        `Update task ${id}`,
        updates
      );

      return createToolResult({
        success: true,
        data: { message: 'Task ready to update', preview: { id, ...updates } },
        requiresConfirmation: true,
        confirmationPrompt: confirmation,
      });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }

  async executeConfirmed(params, context) {
    try {
      const { id, ...patch } = params;

      const task = await this.taskService.updateTask({
        user: { id: context.userId, timezone: context.timezone },
        householdId: context.householdId,
        id,
        patch,
      });

      return createToolResult({ success: true, data: task });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Complete a task
 */
export class CompleteTaskTool extends AITool {
  constructor(taskService) {
    super({
      name: 'complete_task',
      description: 'Mark a task as completed. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID to complete' },
        },
        required: ['id'],
      },
      category: TOOL_CATEGORIES.WRITE,
      requiresConfirmation: true,
    });
    this.taskService = taskService;
  }

  async execute(params, context) {
    try {
      const validation = this.validate(params);
      if (!validation.valid) {
        return createToolResult({ success: false, error: validation.errors.join(', ') });
      }

      const { id } = params;

      const confirmation = createConfirmationPrompt(
        this.name,
        `Mark task ${id} as completed`,
        { id }
      );

      return createToolResult({
        success: true,
        data: { message: 'Task ready to complete', preview: { id } },
        requiresConfirmation: true,
        confirmationPrompt: confirmation,
      });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }

  async executeConfirmed(params, context) {
    try {
      const { id } = params;

      const task = await this.taskService.completeTask({
        householdId: context.householdId,
        id,
      });

      return createToolResult({ success: true, data: task });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Create a calendar event
 */
export class CreateCalendarEventTool extends AITool {
  constructor(calendarService) {
    super({
      name: 'create_calendar_event',
      description: 'Create a new calendar event. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title' },
          description: { type: 'string', description: 'Optional event description' },
          startAt: { type: 'string', format: 'date-time', description: 'Start date-time (ISO 8601)' },
          endAt: { type: 'string', format: 'date-time', description: 'End date-time (ISO 8601)' },
          allDay: { type: 'boolean', default: false, description: 'Whether this is an all-day event' },
          category: { type: 'string', enum: ['GENERAL', 'FAMILY', 'HOME', 'HEALTH', 'WORK', 'OTHER'], default: 'GENERAL', description: 'Event category' },
          location: { type: 'string', description: 'Optional location' },
          reminder: {
            type: 'object',
            description: 'Optional reminder',
            properties: {
              offsetMinutes: { type: 'integer', minimum: 0, description: 'Minutes before event' },
              enabled: { type: 'boolean', default: true },
            },
            required: ['offsetMinutes'],
          },
          recurrence: {
            type: 'object',
            description: 'Optional recurrence rule',
            properties: {
              frequency: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] },
              interval: { type: 'integer', minimum: 1, default: 1 },
              daysOfWeek: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
              endDate: { type: 'string', format: 'date' },
            },
            required: ['frequency'],
          },
        },
        required: ['title', 'startAt', 'endAt'],
      },
      category: TOOL_CATEGORIES.WRITE,
      requiresConfirmation: true,
    });
    this.calendarService = calendarService;
  }

  async execute(params, context) {
    try {
      const validation = this.validate(params);
      if (!validation.valid) {
        return createToolResult({ success: false, error: validation.errors.join(', ') });
      }

      const { title, startAt, endAt, allDay } = params;
      const start = new Date(startAt);
      const end = new Date(endAt);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return createToolResult({ success: false, error: 'Invalid date format. Use ISO 8601 (e.g., 2026-10-15T10:00:00Z)' });
      }

      if (end < start) {
        return createToolResult({ success: false, error: 'End time must be after start time' });
      }

      const confirmation = createConfirmationPrompt(
        this.name,
        `Create calendar event "${title}"`,
        { title, startAt, endAt, allDay, ...params }
      );

      return createToolResult({
        success: true,
        data: { message: 'Calendar event ready to create', preview: params },
        requiresConfirmation: true,
        confirmationPrompt: confirmation,
      });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }

  async executeConfirmed(params, context) {
    try {
      const data = { ...params };
      data.startAt = new Date(params.startAt);
      data.endAt = new Date(params.endAt);

      const event = await this.calendarService.createEvent({
        user: { id: context.userId, timezone: context.timezone },
        householdId: context.householdId,
        data,
      });

      return createToolResult({ success: true, data: event });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Create a meal plan entry
 */
export class CreateMealTool extends AITool {
  constructor(mealService) {
    super({
      name: 'create_meal',
      description: 'Create a new meal plan entry. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date', description: 'Date (YYYY-MM-DD)' },
          mealType: { type: 'string', enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'], description: 'Meal type' },
          recipeId: { type: 'string', description: 'Optional recipe ID' },
          title: { type: 'string', description: 'Optional custom title (required if no recipe)' },
          notes: { type: 'string', description: 'Optional notes' },
        },
        required: ['date', 'mealType'],
      },
      category: TOOL_CATEGORIES.WRITE,
      requiresConfirmation: true,
    });
    this.mealService = mealService;
  }

  async execute(params, context) {
    try {
      const validation = this.validate(params);
      if (!validation.valid) {
        return createToolResult({ success: false, error: validation.errors.join(', ') });
      }

      const { date, mealType, recipeId, title } = params;
      if (!recipeId && !title) {
        return createToolResult({ success: false, error: 'Either recipeId or title is required' });
      }

      const confirmation = createConfirmationPrompt(
        this.name,
        `Create ${mealType.toLowerCase()} plan for ${date}`,
        params
      );

      return createToolResult({
        success: true,
        data: { message: 'Meal plan ready to create', preview: params },
        requiresConfirmation: true,
        confirmationPrompt: confirmation,
      });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }

  async executeConfirmed(params, context) {
    try {
      const meal = await this.mealService.createMeal({
        user: { id: context.userId, timezone: context.timezone },
        householdId: context.householdId,
        data: params,
      });

      return createToolResult({ success: true, data: meal });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Create a shopping list item
 */
export class CreateShoppingItemTool extends AITool {
  constructor(shoppingService) {
    super({
      name: 'create_shopping_item',
      description: 'Add an item to a shopping list. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          listId: { type: 'string', description: 'Shopping list ID' },
          name: { type: 'string', description: 'Item name' },
          quantity: { type: 'number', description: 'Quantity' },
          unit: { type: 'string', description: 'Unit (e.g., kg, pcs, L)' },
          category: { type: 'string', enum: ['PRODUCE', 'MEAT', 'SEAFOOD', 'DAIRY', 'PANTRY', 'FROZEN', 'DRINKS', 'HOUSEHOLD', 'OTHER'], default: 'OTHER', description: 'Item category' },
          notes: { type: 'string', description: 'Optional notes' },
        },
        required: ['listId', 'name'],
      },
      category: TOOL_CATEGORIES.WRITE,
      requiresConfirmation: true,
    });
    this.shoppingService = shoppingService;
  }

  async execute(params, context) {
    try {
      const validation = this.validate(params);
      if (!validation.valid) {
        return createToolResult({ success: false, error: validation.errors.join(', ') });
      }

      const { listId, name } = params;

      const confirmation = createConfirmationPrompt(
        this.name,
        `Add "${name}" to shopping list ${listId}`,
        params
      );

      return createToolResult({
        success: true,
        data: { message: 'Shopping item ready to add', preview: params },
        requiresConfirmation: true,
        confirmationPrompt: confirmation,
      });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }

  async executeConfirmed(params, context) {
    try {
      const { listId, ...data } = params;

      const item = await this.shoppingService.createItem({
        householdId: context.householdId,
        listId,
        data,
      });

      return createToolResult({ success: true, data: item });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Update inventory (add stock, consume, waste, adjust)
 */
export class UpdateInventoryTool extends AITool {
  constructor(inventoryService) {
    super({
      name: 'update_inventory',
      description: 'Update inventory quantity (purchase, consume, waste, or adjust). Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string', description: 'Inventory item ID' },
          action: { type: 'string', enum: ['purchase', 'consume', 'waste', 'adjust'], description: 'Type of update' },
          quantity: { type: 'number', description: 'Quantity (positive number). For adjust, this is the new absolute quantity.' },
          note: { type: 'string', description: 'Optional note' },
          category: { type: 'string', enum: ['PRODUCE', 'MEAT', 'SEAFOOD', 'DAIRY', 'PANTRY', 'FROZEN', 'DRINKS', 'HOUSEHOLD', 'OTHER'], description: 'Category (for new items when purchasing)' },
          location: { type: 'string', enum: ['PANTRY', 'REFRIGERATOR', 'FREEZER', 'HOUSEHOLD', 'OTHER'], description: 'Location (for new items when purchasing)' },
          expiresAt: { type: 'string', format: 'date', description: 'Expiry date (for new items when purchasing, YYYY-MM-DD)' },
        },
        required: ['itemId', 'action', 'quantity'],
      },
      category: TOOL_CATEGORIES.WRITE,
      requiresConfirmation: true,
    });
    this.inventoryService = inventoryService;
  }

  async execute(params, context) {
    try {
      const validation = this.validate(params);
      if (!validation.valid) {
        return createToolResult({ success: false, error: validation.errors.join(', ') });
      }

      const { itemId, action, quantity } = params;
      if (quantity <= 0) {
        return createToolResult({ success: false, error: 'Quantity must be positive' });
      }

      const actionLabels = {
        purchase: 'Add to inventory',
        consume: 'Consume from inventory',
        waste: 'Mark as waste',
        adjust: 'Adjust inventory to',
      };

      const confirmation = createConfirmationPrompt(
        this.name,
        `${actionLabels[action]} ${quantity} (item ${itemId})`,
        params
      );

      return createToolResult({
        success: true,
        data: { message: `Inventory ${action} ready`, preview: params },
        requiresConfirmation: true,
        confirmationPrompt: confirmation,
      });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }

  async executeConfirmed(params, context) {
    try {
      const { itemId, action, quantity, note, category, location, expiresAt } = params;

      let result;
      const user = { id: context.userId, timezone: context.timezone };
      const householdId = context.householdId;

      switch (action) {
        case 'purchase':
          result = await this.inventoryService.addStock({ user, householdId, id: itemId, data: { quantity, note } });
          break;
        case 'consume':
          result = await this.inventoryService.consumeItem({ user, householdId, id: itemId, data: { quantity, note } });
          break;
        case 'waste':
          result = await this.inventoryService.wasteItem({ user, householdId, id: itemId, data: { quantity, note } });
          break;
        case 'adjust':
          result = await this.inventoryService.adjustStock({ user, householdId, id: itemId, data: { quantity, note } });
          break;
        default:
          return createToolResult({ success: false, error: `Unknown action: ${action}` });
      }

      return createToolResult({ success: true, data: result });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Create a note
 */
export class CreateNoteTool extends AITool {
  constructor(notesService) {
    super({
      name: 'create_note',
      description: 'Create a new note. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Note title' },
          content: { type: 'string', description: 'Note content (plain text)' },
          category: { type: 'string', description: 'Optional category' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
          pinned: { type: 'boolean', default: false, description: 'Pin the note' },
        },
        required: ['title', 'content'],
      },
      category: TOOL_CATEGORIES.WRITE,
      requiresConfirmation: true,
    });
    this.notesService = notesService;
  }

  async execute(params, context) {
    try {
      const validation = this.validate(params);
      if (!validation.valid) {
        return createToolResult({ success: false, error: validation.errors.join(', ') });
      }

      const { title } = params;

      const confirmation = createConfirmationPrompt(
        this.name,
        `Create note "${title}"`,
        params
      );

      return createToolResult({
        success: true,
        data: { message: 'Note ready to create', preview: params },
        requiresConfirmation: true,
        confirmationPrompt: confirmation,
      });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }

  async executeConfirmed(params, context) {
    try {
      const note = await this.notesService.createNote({
        user: { id: context.userId },
        householdId: context.householdId,
        data: params,
      });

      return createToolResult({ success: true, data: note });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Create an idea
 */
export class CreateIdeaTool extends AITool {
  constructor(ideasService) {
    super({
      name: 'create_idea',
      description: 'Create a new idea/wishlist entry. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Idea title' },
          description: { type: 'string', description: 'Optional description' },
          category: { type: 'string', description: 'Optional category' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM', description: 'Priority' },
          status: { type: 'string', enum: ['IDEA', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], default: 'IDEA', description: 'Status' },
          estimatedCost: { type: 'number', description: 'Optional estimated cost' },
          currency: { type: 'string', default: 'SGD', description: 'Currency (ISO 4217)' },
          notes: { type: 'string', description: 'Optional notes' },
        },
        required: ['title'],
      },
      category: TOOL_CATEGORIES.WRITE,
      requiresConfirmation: true,
    });
    this.ideasService = ideasService;
  }

  async execute(params, context) {
    try {
      const validation = this.validate(params);
      if (!validation.valid) {
        return createToolResult({ success: false, error: validation.errors.join(', ') });
      }

      const { title } = params;

      const confirmation = createConfirmationPrompt(
        this.name,
        `Create idea "${title}"`,
        params
      );

      return createToolResult({
        success: true,
        data: { message: 'Idea ready to create', preview: params },
        requiresConfirmation: true,
        confirmationPrompt: confirmation,
      });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }

  async executeConfirmed(params, context) {
    try {
      const idea = await this.ideasService.createIdea({
        user: { id: context.userId },
        householdId: context.householdId,
        data: params,
      });

      return createToolResult({ success: true, data: idea });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Create a family event
 */
export class CreateFamilyEventTool extends AITool {
  constructor(familyService) {
    super({
      name: 'create_family_event',
      description: 'Create a new family event. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title' },
          kind: { type: 'string', description: 'Event kind (e.g., Birthday, Anniversary, Graduation, School event, Important)' },
          eventDate: { type: 'string', format: 'date', description: 'Event date (YYYY-MM-DD)' },
          repeatsYearly: { type: 'boolean', default: false, description: 'Repeat yearly' },
          memberId: { type: 'string', description: 'Optional family member ID' },
          notes: { type: 'string', description: 'Optional notes' },
        },
        required: ['title', 'kind', 'eventDate'],
      },
      category: TOOL_CATEGORIES.WRITE,
      requiresConfirmation: true,
    });
    this.familyService = familyService;
  }

  async execute(params, context) {
    try {
      const validation = this.validate(params);
      if (!validation.valid) {
        return createToolResult({ success: false, error: validation.errors.join(', ') });
      }

      const { title, kind, eventDate } = params;

      const confirmation = createConfirmationPrompt(
        this.name,
        `Create family event "${title}" (${kind}) on ${eventDate}`,
        params
      );

      return createToolResult({
        success: true,
        data: { message: 'Family event ready to create', preview: params },
        requiresConfirmation: true,
        confirmationPrompt: confirmation,
      });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }

  async executeConfirmed(params, context) {
    try {
      const event = await this.familyService.createEvent({
        user: { id: context.userId },
        householdId: context.householdId,
        data: params,
      });

      return createToolResult({ success: true, data: event });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Create a maintenance item
 */
export class CreateMaintenanceItemTool extends AITool {
  constructor(homeService) {
    super({
      name: 'create_maintenance_item',
      description: 'Create a new home maintenance job. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Maintenance title' },
          description: { type: 'string', description: 'Optional description' },
          category: { type: 'string', description: 'Category (e.g., Plumbing, Electrical, Appliance, Painting)' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM', description: 'Priority' },
          status: { type: 'string', enum: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], default: 'OPEN', description: 'Status' },
          scheduledDate: { type: 'string', format: 'date', description: 'Scheduled date (YYYY-MM-DD)' },
          roomId: { type: 'string', description: 'Optional room ID' },
          transactionId: { type: 'string', description: 'Optional linked finance transaction ID' },
          notes: { type: 'string', description: 'Optional notes' },
        },
        required: ['title', 'category', 'scheduledDate'],
      },
      category: TOOL_CATEGORIES.WRITE,
      requiresConfirmation: true,
    });
    this.homeService = homeService;
  }

  async execute(params, context) {
    try {
      const validation = this.validate(params);
      if (!validation.valid) {
        return createToolResult({ success: false, error: validation.errors.join(', ') });
      }

      const { title, category, scheduledDate } = params;

      const confirmation = createConfirmationPrompt(
        this.name,
        `Create maintenance job "${title}" (${category}) for ${scheduledDate}`,
        params
      );

      return createToolResult({
        success: true,
        data: { message: 'Maintenance job ready to create', preview: params },
        requiresConfirmation: true,
        confirmationPrompt: confirmation,
      });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }

  async executeConfirmed(params, context) {
    try {
      const maintenance = await this.homeService.createMaintenance({
        user: { id: context.userId },
        householdId: context.householdId,
        data: params,
      });

      return createToolResult({ success: true, data: maintenance });
    } catch (error) {
      return createToolResult({ success: false, error: error.message });
    }
  }
}

/**
 * Factory function to create all write tools with their service dependencies
 */
export function createWriteTools(services) {
  return [
    new CreateTaskTool(services.taskService),
    new UpdateTaskTool(services.taskService),
    new CompleteTaskTool(services.taskService),
    new CreateCalendarEventTool(services.calendarService),
    new CreateMealTool(services.mealService),
    new CreateShoppingItemTool(services.shoppingService),
    new UpdateInventoryTool(services.inventoryService),
    new CreateNoteTool(services.notesService),
    new CreateIdeaTool(services.ideasService),
    new CreateFamilyEventTool(services.familyService),
    new CreateMaintenanceItemTool(services.homeService),
  ];
}

export default createWriteTools;