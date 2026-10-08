import { AppError, ErrorCodes } from '../../shared/errors.js';
import { fieldError, throwValidationError } from '../validators/shared.js';
import { parseDateString } from '../validators/format.js';
import * as calendarRepository from '../repositories/calendarRepository.js';
import * as taskRepository from '../repositories/taskRepository.js';
import * as mealRepository from '../repositories/mealRepository.js';
import * as financeRepository from '../repositories/financeRepository.js';
import * as familyRepository from '../repositories/familyRepository.js';
import * as homeRepository from '../repositories/homeRepository.js';
import { toMealEventView } from './mealService.js';
import { toBillEventView } from './financePlanningService.js';
import { DAY_MS, occurrenceDates } from '../utils/recurrence.js';
import {
  endOfDayFromString,
  startOfDayFromString,
  toDateString,
} from '../utils/time.js';

const MAX_RANGE_DAYS = 366;
const MAX_INSTANCES = 500;

function notFound() {
  return new AppError('Calendar event not found.', {
    code: ErrorCodes.NOT_FOUND,
    status: 404,
  });
}

function normalizeRecurrence(recurrence) {
  return recurrence && typeof recurrence === 'object' ? recurrence : null;
}

function toEventView(event, { startAt = event.startAt, endAt = event.endAt, recurring = false } = {}) {
  return {
    id: event.id,
    sourceType: event.sourceType,
    sourceId: event.sourceId,
    title: event.title,
    description: event.description,
    location: event.location,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    allDay: event.allDay,
    category: event.category,
    reminder:
      event.reminderOffsetMinutes === null
        ? null
        : { offsetMinutes: event.reminderOffsetMinutes, enabled: event.reminderEnabled },
    recurrence: normalizeRecurrence(event.recurrence),
    recurring,
    createdBy: event.createdBy ? { id: event.createdBy.id, name: event.createdBy.name } : null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

function isAllDayDue(dueAt, timezone) {
  return endOfDayFromString(toDateString(dueAt, timezone), timezone) === dueAt.getTime();
}

// Tasks with a due date surface on the calendar as read-only derived items
// (never persisted as CalendarEvent rows — see docs/calendar.md).
function toTaskEventView(task, timezone) {
  return {
    id: `task:${task.id}`,
    sourceType: 'TASK',
    sourceId: task.id,
    title: task.title,
    description: task.description,
    location: null,
    startAt: task.dueAt.toISOString(),
    endAt: task.dueAt.toISOString(),
    allDay: isAllDayDue(task.dueAt, timezone),
    category: null,
    reminder: null,
    recurrence: normalizeRecurrence(task.recurrence),
    recurring: Boolean(task.recurrence) || Boolean(task.seriesId),
    task: {
      id: task.id,
      status: task.status,
      priority: task.priority,
      category: task.category ? { id: task.category.id, name: task.category.name } : null,
      assignee: task.assignedTo ? { id: task.assignedTo.id, name: task.assignedTo.name } : null,
    },
    createdBy: null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

// Family events are derived from the family module — never duplicated as
// CalendarEvent rows. All-day, anchored to the stored event date.
function toFamilyEventView(event) {
  const startAt = event.eventDate;
  return {
    id: `family:${event.id}`,
    sourceType: 'FAMILY',
    sourceId: event.id,
    title: event.title,
    description: event.notes,
    location: null,
    startAt: startAt.toISOString(),
    endAt: startAt.toISOString(),
    allDay: true,
    category: event.kind,
    reminder: null,
    recurrence: null,
    recurring: event.repeatsYearly,
    family: event.member ? { id: event.member.id, name: event.member.name } : null,
    createdBy: null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

// Birthdays are derived from family members' dateOfBirth — one occurrence per
// year inside the requested range. Feb 29 birthdays land on Feb 28 in
// non-leap years.
function toBirthdayView(member, year) {
  const month = member.dateOfBirth.getUTCMonth();
  const day = member.dateOfBirth.getUTCDate();
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const safeDay = month === 1 && day === 29 && !isLeap(year) ? 28 : day;
  const startAt = new Date(Date.UTC(year, month, safeDay));
  return {
    id: `birthday:${member.id}:${year}`,
    sourceType: 'FAMILY',
    sourceId: member.id,
    title: `${member.name}'s birthday`,
    description: null,
    location: null,
    startAt: startAt.toISOString(),
    endAt: startAt.toISOString(),
    allDay: true,
    category: 'Birthday',
    reminder: null,
    recurrence: null,
    recurring: true,
    family: { id: member.id, name: member.name },
    createdBy: null,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
}

// Maintenance jobs with a scheduled date surface as read-only derived items.
function toMaintenanceEventView(maintenance) {
  const startAt = maintenance.scheduledDate;
  return {
    id: `maintenance:${maintenance.id}`,
    sourceType: 'MAINTENANCE',
    sourceId: maintenance.id,
    title: maintenance.title,
    description: maintenance.description,
    location: null,
    startAt: startAt.toISOString(),
    endAt: startAt.toISOString(),
    allDay: true,
    category: maintenance.category,
    reminder: null,
    recurrence: null,
    recurring: false,
    maintenance: {
      id: maintenance.id,
      status: maintenance.status,
      room: maintenance.room ? { id: maintenance.room.id, name: maintenance.room.name } : null,
    },
    createdBy: null,
    createdAt: maintenance.createdAt,
    updatedAt: maintenance.updatedAt,
  };
}

function monthBounds(timezone, now) {
  const today = toDateString(now, timezone);
  const [year, month] = today.split('-').map(Number);
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { first: `${prefix}-01`, last: `${prefix}-${String(lastDay).padStart(2, '0')}` };
}

// 'YYYY-MM-DD' -> the same month's last calendar day, as 'YYYY-MM-DD'.
function lastDayOfMonth(dateString) {
  const [year, month] = dateString.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

// Turns the validated query (UTC-midnight Dates) into a bounded instant range
// in the user's timezone. Missing bounds default to the current local month.
function resolveRange(user, query, now = new Date()) {
  const timezone = user.timezone ?? 'UTC';
  const fromInput = query.from ? query.from.toISOString().slice(0, 10) : null;
  const toInput = query.to ? query.to.toISOString().slice(0, 10) : null;

  let fromString;
  let toString;
  if (fromInput && toInput) {
    fromString = fromInput;
    toString = toInput;
  } else if (fromInput) {
    fromString = fromInput;
    toString = lastDayOfMonth(fromInput);
  } else if (toInput) {
    fromString = `${toInput.slice(0, 7)}-01`;
    toString = toInput;
  } else {
    const month = monthBounds(timezone, now);
    fromString = month.first;
    toString = month.last;
  }

  const from = new Date(startOfDayFromString(fromString, timezone));
  const to = new Date(endOfDayFromString(toString, timezone));
  if (to < from) {
    throwValidationError([fieldError('to', 'To must be on or after from.')]);
  }
  if ((to - from) / DAY_MS > MAX_RANGE_DAYS) {
    throwValidationError([fieldError('to', `Range must be at most ${MAX_RANGE_DAYS} days.`)]);
  }
  return { timezone, from, to, fromString, toString };
}

function assertRecurrenceEnd(recurrence, startAt, allDay, timezone) {
  if (!recurrence?.endDate || !startAt) {
    return;
  }
  const anchor = allDay ? startAt.toISOString().slice(0, 10) : toDateString(startAt, timezone);
  if (recurrence.endDate < anchor) {
    throwValidationError([
      fieldError('recurrence', 'Repeat end date must be on or after the start date.'),
    ]);
  }
}

export async function listEvents({ user, householdId, query }) {
  const range = resolveRange(user, query);

  const [events, tasks, meals, bills, familyEvents, birthdayMembers, maintenance] =
    await Promise.all([
      calendarRepository.listEventsForRange(householdId, { from: range.from, to: range.to }),
      taskRepository.listTasksDueBetween(householdId, range.from, range.to),
      mealRepository.listRange(
        householdId,
        parseDateString(range.fromString),
        parseDateString(range.toString),
      ),
      financeRepository.listBillsForCalendar(
        householdId,
        parseDateString(range.fromString),
        parseDateString(range.toString),
      ),
      familyRepository.listEventsInRange(householdId, range.from, range.to),
      familyRepository.listMembersWithBirthday(householdId),
      homeRepository.listMaintenanceInRange(householdId, { from: range.from, to: range.to }),
    ]);

  const items = [];
  for (const event of events) {
    if (event.recurrence) {
      const duration = event.endAt.getTime() - event.startAt.getTime();
      const starts = occurrenceDates(event.recurrence, {
        start: event.startAt,
        from: range.from,
        to: range.to,
        limit: MAX_INSTANCES,
      });
      for (const startAt of starts) {
        items.push(
          toEventView(event, {
            startAt,
            endAt: new Date(startAt.getTime() + duration),
            recurring: true,
          }),
        );
      }
    } else {
      items.push(toEventView(event));
    }
  }
  for (const task of tasks) {
    items.push(toTaskEventView(task, range.timezone));
  }
  for (const meal of meals) {
    items.push(toMealEventView(meal, range.timezone));
  }
  for (const bill of bills) {
    items.push(toBillEventView(bill, range.timezone));
  }
  for (const event of familyEvents) {
    items.push(toFamilyEventView(event));
  }
  for (const member of birthdayMembers) {
    const fromYear = range.from.getUTCFullYear();
    const toYear = range.to.getUTCFullYear();
    for (let year = fromYear; year <= toYear; year += 1) {
      items.push(toBirthdayView(member, year));
    }
  }
  for (const job of maintenance) {
    items.push(toMaintenanceEventView(job));
  }

  items.sort(
    (a, b) =>
      a.startAt.localeCompare(b.startAt) || (a.title ?? '').localeCompare(b.title ?? ''),
  );

  return {
    events: items,
    from: range.fromString,
    to: range.toString,
  };
}

export async function getEvent({ householdId, id }) {
  const event = await calendarRepository.findEventById(id, householdId);
  if (!event) {
    throw notFound();
  }
  return toEventView(event, { recurring: Boolean(event.recurrence) });
}

export async function createEvent({ user, householdId, data }) {
  const timezone = user.timezone ?? 'UTC';
  assertRecurrenceEnd(data.recurrence, data.startAt, data.allDay, timezone);

  const event = await calendarRepository.createEvent({
    householdId,
    createdById: user.id,
    title: data.title,
    description: data.description,
    allDay: data.allDay,
    startAt: data.startAt,
    endAt: data.endAt,
    category: data.category,
    location: data.location,
    reminderOffsetMinutes: data.reminder ? data.reminder.offsetMinutes : null,
    reminderEnabled: data.reminder ? data.reminder.enabled : true,
    recurrence: data.recurrence,
    sourceType: 'MANUAL',
    sourceId: null,
  });
  return toEventView(event, { recurring: Boolean(event.recurrence) });
}

export async function updateEvent({ user, householdId, id, patch }) {
  const timezone = user.timezone ?? 'UTC';
  const event = await calendarRepository.findEventById(id, householdId);
  if (!event) {
    throw notFound();
  }

  let allDay = event.allDay;
  if (patch.allDay !== undefined) {
    allDay = patch.allDay;
  } else if (patch.start?.allDay !== undefined) {
    allDay = patch.start.allDay;
  } else if (patch.end?.allDay !== undefined) {
    allDay = patch.end.allDay;
  }

  let startAt = event.startAt;
  let endAt = event.endAt;

  if (patch.allDay !== undefined && !patch.start && !patch.end) {
    // Kind toggle without new dates: re-anchor the stored instants.
    if (allDay) {
      startAt = parseDateString(toDateString(event.startAt, timezone)) ?? startAt;
      endAt = parseDateString(toDateString(event.endAt, timezone)) ?? endAt;
    } else {
      startAt = new Date(startOfDayFromString(toDateString(event.startAt, timezone), timezone));
      endAt = new Date(endOfDayFromString(toDateString(event.endAt, timezone), timezone));
    }
  }

  if (patch.start) {
    startAt = patch.start.at;
    if (!patch.end) {
      if (allDay) {
        // Keep the old end day when it is on/after the new start, else same day.
        const alignedEnd = parseDateString(toDateString(event.endAt, timezone));
        endAt =
          alignedEnd && alignedEnd.getTime() >= startAt.getTime() ? alignedEnd : startAt;
      } else if (!event.allDay) {
        // Keep the existing duration when only the start moves.
        const duration = event.endAt.getTime() - event.startAt.getTime();
        endAt = new Date(startAt.getTime() + Math.max(duration, 0));
      } else if (endAt.getTime() < startAt.getTime()) {
        endAt = startAt;
      }
    }
  }
  if (patch.end) {
    endAt = patch.end.at;
  }

  if (endAt.getTime() < startAt.getTime()) {
    throwValidationError([fieldError('end', 'End must be on or after the start.')]);
  }

  const effectiveRule = patch.recurrence !== undefined ? patch.recurrence : event.recurrence;
  assertRecurrenceEnd(effectiveRule, startAt, allDay, timezone);

  const data = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.category !== undefined) data.category = patch.category;
  if (patch.location !== undefined) data.location = patch.location;
  if (patch.reminder !== undefined) {
    data.reminderOffsetMinutes = patch.reminder ? patch.reminder.offsetMinutes : null;
    data.reminderEnabled = patch.reminder ? patch.reminder.enabled : true;
  }
  if (patch.recurrence !== undefined) data.recurrence = patch.recurrence;
  if (patch.start || patch.end || patch.allDay !== undefined) {
    data.startAt = startAt;
    data.endAt = endAt;
    data.allDay = allDay;
  }

  const updated = await calendarRepository.updateEvent(id, householdId, data);
  return toEventView(updated, { recurring: Boolean(updated.recurrence) });
}

export async function deleteEvent({ householdId, id }) {
  const event = await calendarRepository.findEventById(id, householdId);
  if (!event) {
    throw notFound();
  }
  await calendarRepository.deleteEvent(id, householdId);
  return { id, deleted: true };
}
