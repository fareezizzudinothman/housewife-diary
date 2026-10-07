import { prisma } from '../utils/prisma.js';

export function toPublicUser(user) {
  // Explicit field selection: passwordHash must never leak into responses.
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    emailVerifiedAt: user.emailVerifiedAt,
    activeHouseholdId: user.activeHouseholdId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function findByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}

export function findById(id) {
  return prisma.user.findUnique({ where: { id } });
}

export function create({ email, passwordHash, name, timezone = 'UTC' }) {
  return prisma.user.create({
    data: { email, passwordHash, name, timezone },
  });
}

export function updatePassword(id, passwordHash) {
  return prisma.user.update({ where: { id }, data: { passwordHash } });
}

export function updateProfile(id, { name, timezone, activeHouseholdId }) {
  const data = {};
  if (name !== undefined) {
    data.name = name;
  }
  if (timezone !== undefined) {
    data.timezone = timezone;
  }
  if (activeHouseholdId !== undefined) {
    data.activeHouseholdId = activeHouseholdId;
  }
  return prisma.user.update({ where: { id }, data });
}

export function markEmailVerified(id) {
  return prisma.user.update({
    where: { id },
    data: { emailVerifiedAt: new Date() },
  });
}
