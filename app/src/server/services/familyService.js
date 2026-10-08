import { AppError, ErrorCodes } from '../../shared/errors.js';
import { fieldError, throwValidationError } from '../validators/shared.js';
import { toDateString } from '../utils/time.js';
import * as familyRepository from '../repositories/familyRepository.js';
import * as householdMemberRepository from '../repositories/householdMemberRepository.js';

const DEFAULT_EVENT_HORIZON_DAYS = 366;
const DAY_MS = 86_400_000;

function notFound(message = 'Family record not found.') {
  return new AppError(message, { code: ErrorCodes.NOT_FOUND, status: 404 });
}

function conflict(message, field) {
  return new AppError(message, {
    code: ErrorCodes.CONFLICT,
    status: 409,
    details: field ? [fieldError(field, message)] : [],
  });
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function toMemberView(member) {
  return {
    id: member.id,
    name: member.name,
    relationship: member.relationship,
    linkedUserId: member.linkedUserId ?? null,
    linkedUser: member.linkedUser ? { id: member.linkedUser.id, name: member.linkedUser.name } : null,
    dateOfBirth: member.dateOfBirth ? isoDate(member.dateOfBirth) : null,
    notes: member.notes,
    active: member.active,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
  };
}

function toEventView(event) {
  return {
    id: event.id,
    memberId: event.memberId ?? null,
    member: event.member ? { id: event.member.id, name: event.member.name } : null,
    title: event.title,
    kind: event.kind,
    eventDate: isoDate(event.eventDate),
    repeatsYearly: event.repeatsYearly,
    notes: event.notes,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

export async function listMeta({ householdId }) {
  const members = await householdMemberRepository.listByHousehold(householdId);
  return {
    linkedUsers: members.map(({ user }) => ({ id: user.id, name: user.name })),
  };
}

export async function listMembers({ householdId, query }) {
  const [items, total] = await Promise.all([
    familyRepository.listMembers(householdId, query),
    familyRepository.countMembers(householdId, query),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / query.limit));
  return {
    items: items.map(toMemberView),
    page: query.page,
    limit: query.limit,
    total,
    totalPages,
  };
}

export async function getMember({ householdId, id }) {
  const member = await familyRepository.findMemberById(id, householdId);
  if (!member) {
    throw notFound('Family member not found.');
  }
  return toMemberView(member);
}

export async function createMember({ user, householdId, data }) {
  const normalized = data.name.toLowerCase();
  const duplicate = await familyRepository.findMemberByNormalized(householdId, normalized);
  if (duplicate) {
    throw conflict('A family member with this name already exists.', 'name');
  }
  if (data.linkedUserId) {
    await assertLinkedUser(householdId, data.linkedUserId);
  }
  const member = await familyRepository.createMember({
    householdId,
    createdById: user.id,
    name: data.name,
    normalized,
    relationship: data.relationship,
    linkedUserId: data.linkedUserId ?? null,
    dateOfBirth: data.dateOfBirth ?? null,
    notes: data.notes ?? null,
  });
  return toMemberView(member);
}

export async function updateMember({ householdId, id, patch }) {
  const member = await familyRepository.findMemberById(id, householdId);
  if (!member) {
    throw notFound('Family member not found.');
  }

  const data = {};
  if (patch.name !== undefined) {
    data.name = patch.name;
    data.normalized = patch.name.toLowerCase();
    const duplicate = await familyRepository.findMemberByNormalized(
      householdId,
      data.normalized,
      id,
    );
    if (duplicate) {
      throw conflict('A family member with this name already exists.', 'name');
    }
  }
  if (patch.relationship !== undefined) {
    data.relationship = patch.relationship;
  }
  if (patch.linkedUserId !== undefined) {
    if (patch.linkedUserId) {
      await assertLinkedUser(householdId, patch.linkedUserId);
    }
    data.linkedUserId = patch.linkedUserId;
  }
  if (patch.dateOfBirth !== undefined) {
    data.dateOfBirth = patch.dateOfBirth;
  }
  if (patch.notes !== undefined) {
    data.notes = patch.notes;
  }
  if (patch.active !== undefined) {
    data.active = patch.active;
  }

  const updated = await familyRepository.updateMember(id, householdId, data);
  return toMemberView(updated);
}

// DELETE archives: a family member may be referenced by tasks/events/cleaning
// and permanently deleting would orphan that history (idempotent — archiving
// an archived member is a no-op that returns the same view).
export async function archiveMember({ householdId, id }) {
  const member = await familyRepository.findMemberById(id, householdId);
  if (!member) {
    throw notFound('Family member not found.');
  }
  if (!member.active) {
    return toMemberView(member);
  }
  const updated = await familyRepository.updateMember(id, householdId, { active: false });
  return toMemberView(updated);
}

// ---- Events ----

export async function listEvents({ user, householdId, query }) {
  const timezone = user.timezone ?? 'UTC';
  const today = toDateString(new Date(), timezone);
  // The validator returns Date objects for from/to; fill either end with the
  // current day / a default horizon so the list reads as "upcoming".
  const fromDate = query.from ?? new Date(`${today}T00:00:00.000Z`);
  const toDate =
    query.to ?? new Date(fromDate.getTime() + DEFAULT_EVENT_HORIZON_DAYS * DAY_MS);

  const [items, total] = await Promise.all([
    familyRepository.listEvents(householdId, { from: fromDate, to: toDate, memberId: query.memberId, page: query.page, limit: query.limit }),
    familyRepository.countEvents(householdId, { from: fromDate, to: toDate, memberId: query.memberId }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / query.limit));
  return {
    items: items.map(toEventView),
    page: query.page,
    limit: query.limit,
    total,
    totalPages,
  };
}

export async function getEvent({ householdId, id }) {
  const event = await familyRepository.findEventById(id, householdId);
  if (!event) {
    throw notFound('Family event not found.');
  }
  return toEventView(event);
}

export async function createEvent({ user, householdId, data }) {
  if (data.memberId) {
    await assertMember(householdId, data.memberId);
  }
  const event = await familyRepository.createEvent({
    householdId,
    createdById: user.id,
    memberId: data.memberId ?? null,
    title: data.title,
    kind: data.kind,
    eventDate: data.eventDate,
    repeatsYearly: data.repeatsYearly,
    notes: data.notes ?? null,
  });
  return toEventView(event);
}

export async function updateEvent({ householdId, id, patch }) {
  const existing = await familyRepository.findEventById(id, householdId);
  if (!existing) {
    throw notFound('Family event not found.');
  }
  const data = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.kind !== undefined) data.kind = patch.kind;
  if (patch.eventDate !== undefined) data.eventDate = patch.eventDate;
  if (patch.memberId !== undefined) {
    if (patch.memberId) {
      await assertMember(householdId, patch.memberId);
    }
    data.memberId = patch.memberId;
  }
  if (patch.repeatsYearly !== undefined) data.repeatsYearly = patch.repeatsYearly;
  if (patch.notes !== undefined) data.notes = patch.notes;

  const updated = await familyRepository.updateEvent(id, householdId, data);
  return toEventView(updated);
}

export async function deleteEvent({ householdId, id }) {
  const result = await familyRepository.deleteEvent(id, householdId);
  if (result.count === 0) {
    throw notFound('Family event not found.');
  }
  return { deleted: true };
}

async function assertLinkedUser(householdId, userId) {
  const membership = await householdMemberRepository.findByHouseholdAndUser(householdId, userId);
  if (!membership) {
    throwValidationError([
      fieldError('linkedUserId', 'Choose a member of this household.'),
    ]);
  }
}

async function assertMember(householdId, memberId) {
  const member = await familyRepository.findMemberById(memberId, householdId);
  if (!member) {
    throwValidationError([
      fieldError('memberId', 'Choose a family member of this household.'),
    ]);
  }
}