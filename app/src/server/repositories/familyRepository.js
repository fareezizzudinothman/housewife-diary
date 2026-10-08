import { prisma } from '../utils/prisma.js';

export const MEMBER_SELECT = {
  id: true,
  name: true,
  relationship: true,
  linkedUserId: true,
  dateOfBirth: true,
  notes: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  linkedUser: { select: { id: true, name: true } },
};

export const EVENT_SELECT = {
  id: true,
  memberId: true,
  title: true,
  kind: true,
  eventDate: true,
  repeatsYearly: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  member: { select: { id: true, name: true } },
};

function memberWhere(householdId, { search, includeArchived }) {
  const where = { householdId };
  if (!includeArchived) {
    where.active = true;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { relationship: { contains: search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export function listMembers(householdId, { search, includeArchived, page, limit }) {
  return prisma.familyMember.findMany({
    where: memberWhere(householdId, { search, includeArchived }),
    select: MEMBER_SELECT,
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function countMembers(householdId, { search, includeArchived }) {
  return prisma.familyMember.count({ where: memberWhere(householdId, { search, includeArchived }) });
}

export function findMemberById(id, householdId) {
  return prisma.familyMember.findFirst({
    where: { id, householdId },
    select: MEMBER_SELECT,
  });
}

export function findMemberByNormalized(householdId, normalized, excludeId = null) {
  return prisma.familyMember.findFirst({
    where: { householdId, normalized, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
}

export function createMember(data) {
  return prisma.familyMember.create({ data, select: MEMBER_SELECT });
}

export function updateMember(id, householdId, data) {
  return prisma.familyMember.update({
    where: { id },
    data,
    select: MEMBER_SELECT,
  });
}

// Active members with a date of birth — calendar birthdays and the dashboard.
export function listMembersWithBirthday(householdId) {
  return prisma.familyMember.findMany({
    where: { householdId, active: true, dateOfBirth: { not: null } },
    select: {
      id: true,
      name: true,
      dateOfBirth: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { name: 'asc' },
  });
}

// ---- Family events ----

function eventWhere(householdId, { from, to, memberId }) {
  const where = { householdId };
  if (from) {
    where.eventDate = { gte: from };
  }
  if (to) {
    where.eventDate = { ...(where.eventDate ?? {}), lte: to };
  }
  if (memberId) {
    where.memberId = memberId;
  }
  return where;
}

export function listEvents(householdId, { from, to, memberId, page, limit }) {
  return prisma.familyEvent.findMany({
    where: eventWhere(householdId, { from, to, memberId }),
    select: EVENT_SELECT,
    orderBy: [{ eventDate: 'asc' }, { title: 'asc' }],
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function listEventsInRange(householdId, fromDate, toDate) {
  return prisma.familyEvent.findMany({
    where: { householdId, eventDate: { gte: fromDate, lte: toDate } },
    select: EVENT_SELECT,
    orderBy: { eventDate: 'asc' },
  });
}

export function countEvents(householdId, { from, to, memberId }) {
  return prisma.familyEvent.count({ where: eventWhere(householdId, { from, to, memberId }) });
}

export function findEventById(id, householdId) {
  return prisma.familyEvent.findFirst({
    where: { id, householdId },
    select: EVENT_SELECT,
  });
}

export function createEvent(data) {
  return prisma.familyEvent.create({ data, select: EVENT_SELECT });
}

export function updateEvent(id, householdId, data) {
  return prisma.familyEvent.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
    select: EVENT_SELECT,
  });
}

export function deleteEvent(id, householdId) {
  return prisma.familyEvent.deleteMany({ where: { id, householdId } });
}