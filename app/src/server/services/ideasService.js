import { AppError, ErrorCodes } from '../../shared/errors.js';
import * as ideasRepository from '../repositories/ideasRepository.js';
import * as taskRepository from '../repositories/taskRepository.js';
import * as taskService from '../services/taskService.js';

function notFound(message = 'Idea not found.') {
  return new AppError(message, { code: ErrorCodes.NOT_FOUND, status: 404 });
}

function conflict(message, field) {
  return new AppError(message, {
    code: ErrorCodes.CONFLICT,
    status: 409,
    details: [{ field, message }],
  });
}

function toIdeaView(idea) {
  return {
    id: idea.id,
    title: idea.title,
    description: idea.description ?? null,
    category: idea.category ?? null,
    priority: idea.priority,
    status: idea.status,
    estimatedCost: idea.estimatedCost !== null ? idea.estimatedCost.toString() : null,
    currency: idea.currency,
    notes: idea.notes ?? null,
    createdBy: { id: idea.createdBy.id, name: idea.createdBy.name },
    createdAt: idea.createdAt.toISOString(),
    updatedAt: idea.updatedAt.toISOString(),
  };
}

function paginate(total, page, limit) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function listIdeas({ householdId, query }) {
  const [items, total] = await Promise.all([
    ideasRepository.listIdeas(householdId, query),
    ideasRepository.countIdeas(householdId, query),
  ]);
  return { items: items.map(toIdeaView), ...paginate(total, query.page, query.limit) };
}

export async function getIdea({ householdId, id }) {
  const idea = await ideasRepository.findIdeaById(id, householdId);
  if (!idea) {
    throw notFound();
  }
  const task = await taskRepository.findTaskBySource(householdId, 'IDEA', id);
  const view = toIdeaView(idea);
  if (task) {
    view.task = { id: task.id, title: task.title, status: task.status };
  }
  return view;
}

export async function createIdea({ user, householdId, data }) {
  const idea = await ideasRepository.createIdea(
    { householdId, createdById: user.id },
    {
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      status: data.status,
      estimatedCost: data.estimatedCost,
      currency: data.currency,
      notes: data.notes,
    },
  );
  return toIdeaView(idea);
}

export async function updateIdea({ householdId, id, patch }) {
  const existing = await ideasRepository.findIdeaById(id, householdId);
  if (!existing) {
    throw notFound();
  }
  const updated = await ideasRepository.updateIdea(id, householdId, patch);
  return toIdeaView(updated);
}

export async function deleteIdea({ householdId, id }) {
  const result = await ideasRepository.deleteIdea(id, householdId);
  if (result.count === 0) {
    throw notFound();
  }
  // A linked task is real work: it survives so the user does not lose it.
  return { id, deleted: true };
}

export async function generateIdeaTask({ user, householdId, id }) {
  const idea = await ideasRepository.findIdeaById(id, householdId);
  if (!idea) {
    throw notFound();
  }
  const existing = await taskRepository.findTaskBySource(householdId, 'IDEA', id);
  if (existing) {
    throw conflict('This idea already has a task. Delete the task to regenerate it.', 'id');
  }
  return taskService.createTask({
    user,
    householdId,
    data: {
      title: idea.title,
      description: idea.description,
      priority: idea.priority,
      dueDate: null,
    },
    source: { type: 'IDEA', id: idea.id },
  });
}