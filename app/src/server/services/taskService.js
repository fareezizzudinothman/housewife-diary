import { AppError, ErrorCodes } from '../../shared/errors.js';
import { fieldError, throwValidationError } from '../validators/shared.js';
import * as taskRepository from '../repositories/taskRepository.js';
import * as householdMemberRepository from '../repositories/householdMemberRepository.js';
import * as familyRepository from '../repositories/familyRepository.js';
import {
  DAY_MS,
  MAX_EXTENSION_STEPS,
  MAX_SERIES_OCCURRENCES,
  MATERIALIZE_WINDOW_DAYS,
  occurrenceDates,
  ruleEndDateLimit,
} from '../utils/recurrence.js';
import {
  endOfDayFromString,
  getZonedNextStartOfDay,
  getZonedStartOfDay,
  toDateString,
} from '../utils/time.js';

// Keep a week of recent (unmaterialized) history for old series whose first
// materialization happens long after the anchor date.
const RECENT_PAST_DAYS = 7;
const MAX_CATEGORIES = 50;

function notFound() {
  return new AppError('Task not found.', {
    code: ErrorCodes.NOT_FOUND,
    status: 404,
  });
}

function normalizeRecurrence(recurrence) {
  return recurrence && typeof recurrence === 'object' ? recurrence : null;
}

function toTaskView(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    category: task.category ? { id: task.category.id, name: task.category.name } : null,
    assignee: task.assignedTo ? { id: task.assignedTo.id, name: task.assignedTo.name } : null,
    familyAssignee: task.assignedFamilyMember
      ? { id: task.assignedFamilyMember.id, name: task.assignedFamilyMember.name }
      : null,
    source: task.sourceType === 'MANUAL' && !task.sourceId ? null : {
      type: task.sourceType,
      id: task.sourceId ?? null,
    },
    createdBy: task.createdBy ? { id: task.createdBy.id, name: task.createdBy.name } : null,
    recurrence: normalizeRecurrence(task.recurrence),
    seriesId: task.seriesId,
    repeating: Boolean(task.recurrence) || Boolean(task.seriesId),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function resolveDue(data, timezone) {
  if (data.dueAt instanceof Date) {
    return data.dueAt;
  }
  if (typeof data.dueDate === 'string' && data.dueDate) {
    return new Date(endOfDayFromString(data.dueDate, timezone));
  }
  return null;
}

async function assertCategory(categoryId, householdId) {
  if (categoryId === null || categoryId === undefined) {
    return null;
  }
  const category = await taskRepository.findCategoryById(categoryId, householdId);
  if (!category) {
    throwValidationError([fieldError('categoryId', 'Choose a category from the list.')]);
  }
  return category.id;
}

async function assertAssignee(assignedToId, householdId) {
  if (assignedToId === null || assignedToId === undefined) {
    return null;
  }
  const membership = await householdMemberRepository.findByHouseholdAndUser(
    householdId,
    assignedToId,
  );
  if (!membership) {
    throwValidationError([fieldError('assignedToId', 'Choose a member of this household.')]);
  }
  return assignedToId;
}

async function assertFamilyAssignee(assignedFamilyMemberId, householdId) {
  if (assignedFamilyMemberId === null || assignedFamilyMemberId === undefined) {
    return null;
  }
  const member = await familyRepository.findMemberById(assignedFamilyMemberId, householdId);
  if (!member || !member.active) {
    throwValidationError([
      fieldError('assignedFamilyMemberId', 'Choose an active family member.'),
    ]);
  }
  return assignedFamilyMemberId;
}

// A task can be assigned to an app user OR a family member, never both.
function assertSingleAssigner(assignedToId, assignedFamilyMemberId) {
  if (assignedToId && assignedFamilyMemberId) {
    throwValidationError([
      fieldError(
        'assignedFamilyMemberId',
        'Assign the task to either a member or a family member, not both.',
      ),
    ]);
  }
}

// The recurrence rule's endDate is a calendar date; it may not precede the
// day the series starts on.
function assertRecurrenceEnd(recurrence, startAt, timezone) {
  if (!recurrence || !startAt) {
    return;
  }
  if (typeof recurrence.endDate === 'string' && recurrence.endDate) {
    const anchor = toDateString(startAt, timezone);
    if (recurrence.endDate < anchor) {
      throwValidationError([
        fieldError('recurrence', 'Repeat end date must be on or after the start date.'),
      ]);
    }
  }
}

// Materialized rows are plain tasks: the head row owns the rule and the first
// occurrence; each generated row keeps the head's fields and points at it.
function occurrenceRow(head, dueAt) {
  return {
    householdId: head.householdId,
    createdById: head.createdById,
    assignedToId: head.assignedToId ?? null,
    assignedFamilyMemberId: head.assignedFamilyMemberId ?? null,
    categoryId: head.categoryId ?? null,
    title: head.title,
    description: head.description ?? null,
    status: 'TODO',
    priority: head.priority,
    dueAt,
    completedAt: null,
    recurrence: null,
    // Occurrences are plain rows — provenance lives on the head only.
    sourceType: 'MANUAL',
    sourceId: null,
  };
}

// Rolling-window materialization: generate the occurrences that fall between
// the last materialized row (or a recent slice of the past for a brand-new
// old series) and the end of the rolling window, bounded by the rule's end
// date and the hard per-series cap.
async function materializeSeries(head, now = new Date()) {
  const rule = normalizeRecurrence(head.recurrence);
  if (!rule || !head.dueAt) {
    return 0;
  }

  const existing = await taskRepository.listOccurrenceDueDates(head.householdId, [head.id]);
  const remaining = MAX_SERIES_OCCURRENCES - existing.length;
  if (remaining <= 0) {
    return 0;
  }

  const start = head.dueAt;
  const endLimit = ruleEndDateLimit(rule); // exclusive ms
  const windowEnd = now.getTime() + MATERIALIZE_WINDOW_DAYS * DAY_MS;
  let created = 0;

  for (let step = 0; step < MAX_EXTENSION_STEPS && created < remaining; step += 1) {
    const last = existing.length ? existing[existing.length - 1].dueAt : null;
    const fromMs = last
      ? last.getTime() + 1
      : Math.max(start.getTime() + 1, now.getTime() - RECENT_PAST_DAYS * DAY_MS);
    const toMs = Math.min(endLimit - 1, Math.max(windowEnd, fromMs));
    if (fromMs > toMs) {
      break;
    }
    const allowance = remaining - created;
    const dates = occurrenceDates(rule, {
      start,
      from: new Date(fromMs),
      to: new Date(toMs),
      limit: allowance,
    });
    if (!dates.length) {
      break;
    }
    await taskRepository.createOccurrences(
      head.id,
      dates.map((dueAt) => occurrenceRow(head, dueAt)),
    );
    created += dates.length;
    for (const dueAt of dates) {
      existing.push({ seriesId: head.id, dueAt });
    }
    if (dates.length < allowance) {
      // The rule produced everything inside the window; nothing more to add.
      break;
    }
  }

  return created;
}

// Refreshes the rolling window for every recurring series in the household.
// Cheap enough to run on each list call (heads only; usually a handful).
async function ensureSeriesWindows(householdId) {
  const heads = await taskRepository.listSeriesHeads(householdId);
  for (const head of heads) {
    try {
      await materializeSeries(head);
    } catch (error) {
      console.error(`[tasks] failed to extend series ${head.id}: ${error.message}`);
    }
  }
}

export async function listMeta({ householdId }) {
  const [categories, members] = await Promise.all([
    taskRepository.listCategories(householdId),
    householdMemberRepository.listByHousehold(householdId),
  ]);
  return {
    categories: categories.map((category) => ({ id: category.id, name: category.name })),
    members: members.map((member) => ({
      id: member.user.id,
      name: member.user.name,
      role: member.role,
    })),
  };
}

export async function listTasks({ user, householdId, query }) {
  const timezone = user.timezone ?? 'UTC';
  await ensureSeriesWindows(householdId);

  const now = new Date();
  const bounds = {
    startOfToday: new Date(getZonedStartOfDay(now, timezone)),
    endOfToday: new Date(getZonedNextStartOfDay(now, timezone) - 1),
  };
  const where = taskRepository.buildTaskWhere(householdId, query, bounds);
  const [total, tasks] = await Promise.all([
    taskRepository.countTasks(where),
    taskRepository.listTasks(where, query),
  ]);
  return {
    items: tasks.map(toTaskView),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getTask({ householdId, id }) {
  const task = await taskRepository.findTaskById(id, householdId);
  if (!task) {
    throw notFound();
  }
  return toTaskView(task);
}

export async function createTask({ user, householdId, data, source = null }) {
  const timezone = user.timezone ?? 'UTC';
  const dueAt = resolveDue(data, timezone);
  const categoryId = await assertCategory(data.categoryId, householdId);
  const assignedToId = await assertAssignee(data.assignedToId, householdId);
  const assignedFamilyMemberId = await assertFamilyAssignee(
    data.assignedFamilyMemberId,
    householdId,
  );
  assertSingleAssigner(assignedToId, assignedFamilyMemberId);
  assertRecurrenceEnd(data.recurrence, dueAt, timezone);

  const base = {
    householdId,
    createdById: user.id,
    assignedToId,
    assignedFamilyMemberId,
    categoryId,
    title: data.title,
    description: data.description,
    status: data.status,
    priority: data.priority,
    dueAt,
    recurrence: data.recurrence,
    // Head provenance for generated tasks (cleaning/maintenance/ideas);
    // manual tasks keep MANUAL/NULL. Internal callers only — the unique
    // (sourceType, sourceId) pair is the duplicate-task guard.
    sourceType: source ? source.type : 'MANUAL',
    sourceId: source ? source.id : null,
  };

  if (!data.recurrence) {
    const task = await taskRepository.createTask(base);
    return toTaskView(task);
  }

  const head = await taskRepository.createSeries(base, []);
  await materializeSeries(head);
  const refreshed = await taskRepository.findTaskById(head.id, householdId);
  return toTaskView(refreshed ?? head);
}

export async function updateTask({ user, householdId, id, patch }) {
  const timezone = user.timezone ?? 'UTC';
  const task = await taskRepository.findTaskById(id, householdId);
  if (!task) {
    throw notFound();
  }

  const data = {};
  if (patch.title !== undefined) {
    data.title = patch.title;
  }
  if (patch.description !== undefined) {
    data.description = patch.description;
  }
  if (patch.priority !== undefined) {
    data.priority = patch.priority;
  }
  if (patch.status !== undefined) {
    data.status = patch.status;
    data.completedAt = patch.status === 'COMPLETED' ? new Date() : null;
  }
  if ('dueAt' in patch || 'dueDate' in patch) {
    data.dueAt = resolveDue(patch, timezone);
  }
  if (patch.assignedToId !== undefined) {
    data.assignedToId = await assertAssignee(patch.assignedToId, householdId);
  }
  if (patch.assignedFamilyMemberId !== undefined) {
    data.assignedFamilyMemberId = await assertFamilyAssignee(
      patch.assignedFamilyMemberId,
      householdId,
    );
  }
  assertSingleAssigner(
    'assignedToId' in data ? data.assignedToId : task.assignedToId,
    'assignedFamilyMemberId' in data ? data.assignedFamilyMemberId : task.assignedFamilyMemberId,
  );
  if (patch.categoryId !== undefined) {
    data.categoryId = await assertCategory(patch.categoryId, householdId);
  }
  if (patch.recurrence !== undefined) {
    if (patch.recurrence && task.seriesId) {
      throwValidationError([
        fieldError('recurrence', 'This task is part of a repeating series and cannot own a rule.'),
      ]);
    }
    data.recurrence = patch.recurrence;
  }

  const effectiveDue =
    'dueAt' in data ? data.dueAt : task.dueAt;
  const effectiveRule =
    patch.recurrence !== undefined ? patch.recurrence : task.recurrence;
  assertRecurrenceEnd(effectiveRule, effectiveDue, timezone);

  const updated = await taskRepository.updateTask(id, householdId, data);

  const scheduleChanged =
    patch.recurrence !== undefined ||
    ('dueAt' in data && (data.dueAt?.getTime() ?? null) !== (task.dueAt?.getTime() ?? null));

  if (task.recurrence || patch.recurrence !== undefined) {
    if (!effectiveRule) {
      // The series was dissolved: drop the pending generated rows.
      await taskRepository.deleteOpenOccurrences(id);
    } else if (scheduleChanged || !task.recurrence) {
      await taskRepository.deleteOpenOccurrences(id);
      await materializeSeries(updated);
    } else {
      // Content-only edit: mirror it onto the still-open occurrences.
      const propagate = {};
      if (data.title !== undefined) propagate.title = data.title;
      if (data.description !== undefined) propagate.description = data.description;
      if (data.priority !== undefined) propagate.priority = data.priority;
      if (data.assignedToId !== undefined) propagate.assignedToId = data.assignedToId;
      if (data.assignedFamilyMemberId !== undefined) {
        propagate.assignedFamilyMemberId = data.assignedFamilyMemberId;
      }
      if (data.categoryId !== undefined) propagate.categoryId = data.categoryId;
      if (Object.keys(propagate).length) {
        await taskRepository.updateOpenOccurrences(id, propagate);
      }
    }
  }

  return toTaskView(updated);
}

export async function completeTask({ householdId, id }) {
  const task = await taskRepository.findTaskById(id, householdId);
  if (!task) {
    throw notFound();
  }
  const updated = await taskRepository.updateTask(id, householdId, {
    status: 'COMPLETED',
    completedAt: new Date(),
  });
  return toTaskView(updated);
}

export async function deleteTask({ householdId, id, series }) {
  const task = await taskRepository.findTaskById(id, householdId);
  if (!task) {
    throw notFound();
  }
  const targetId = series && task.seriesId ? task.seriesId : task.id;
  await taskRepository.deleteTask(targetId, householdId);
  return { id: task.id, deleted: true };
}

// ---- Categories ----

export async function listCategories({ householdId }) {
  const categories = await taskRepository.listCategories(householdId);
  const counts = await taskRepository.countCategoryUsage(householdId);
  const byId = new Map(counts.map((row) => [row.categoryId, row._count.categoryId]));
  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      taskCount: byId.get(category.id) ?? 0,
    })),
  };
}

export async function createCategory({ householdId, data }) {
  const existing = await taskRepository.listCategories(householdId);
  if (existing.length >= MAX_CATEGORIES) {
    throw new AppError(`A household can have at most ${MAX_CATEGORIES} categories.`, {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
      details: [fieldError('name', `A household can have at most ${MAX_CATEGORIES} categories.`)],
    });
  }
  try {
    const category = await taskRepository.createCategory({
      householdId,
      name: data.name,
      normalized: data.normalized,
    });
    return { id: category.id, name: category.name, taskCount: 0 };
  } catch (error) {
    if (error.code === 'P2002') {
      throw new AppError('A category with this name already exists.', {
        code: ErrorCodes.CONFLICT,
        status: 409,
        details: [fieldError('name', 'A category with this name already exists.')],
      });
    }
    throw error;
  }
}

export async function deleteCategory({ householdId, id }) {
  const category = await taskRepository.findCategoryById(id, householdId);
  if (!category) {
    throw new AppError('Category not found.', {
      code: ErrorCodes.NOT_FOUND,
      status: 404,
    });
  }
  await taskRepository.deleteCategory(id, householdId);
  return { id, deleted: true };
}
