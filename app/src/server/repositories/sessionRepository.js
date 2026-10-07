import { prisma } from '../utils/prisma.js';

export function create({ userId, tokenHash, expiresAt, rememberMe, userAgent, ip }) {
  return prisma.session.create({
    data: { userId, tokenHash, expiresAt, rememberMe, userAgent, ip },
  });
}

export function findByTokenHash(tokenHash) {
  return prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
}

export function listByUser(userId) {
  return prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export function findByIdAndUser(id, userId) {
  return prisma.session.findFirst({ where: { id, userId } });
}

export function extendExpiry(id, expiresAt) {
  return prisma.session.update({ where: { id }, data: { expiresAt } });
}

export function deleteByTokenHash(tokenHash) {
  return prisma.session.deleteMany({ where: { tokenHash } });
}

export function deleteById(id) {
  return prisma.session.delete({ where: { id } });
}

export function deleteAllForUserExcept(userId, keepSessionId) {
  return prisma.session.deleteMany({
    where: { userId, id: { not: keepSessionId } },
  });
}

export function deleteAllForUser(userId) {
  return prisma.session.deleteMany({ where: { userId } });
}
