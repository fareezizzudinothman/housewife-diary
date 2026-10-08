import { PrismaClient } from '@prisma/client';
import { getZonedStartOfDay, getZonedNextStartOfDay } from '../utils/time.js';

const prisma = new PrismaClient();

export async function createNotification(data) {
  return prisma.notification.create({ data });
}

export async function createNotificationTx(tx, data) {
  return tx.notification.create({ data });
}

export async function findByDedupeKey(userId, dedupeKey) {
  return prisma.notification.findUnique({
    where: { userId_dedupeKey: { userId, dedupeKey } },
  });
}

export async function findByDedupeKeyTx(tx, userId, dedupeKey) {
  return tx.notification.findUnique({
    where: { userId_dedupeKey: { userId, dedupeKey } },
  });
}

export async function listNotifications(userId, params = {}) {
  const { page = 1, limit = 20, unreadOnly = false, includeArchived = false } = params;
  const skip = (page - 1) * limit;

  const where = {
    userId,
    ...(unreadOnly ? { readAt: null } : {}),
    ...(includeArchived ? {} : { archivedAt: null }),
  };

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export async function countUnread(userId) {
  return prisma.notification.count({
    where: { userId, readAt: null, archivedAt: null },
  });
}

export async function markRead(notificationId, userId) {
  return prisma.notification.update({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null, archivedAt: null },
    data: { readAt: new Date() },
  });
}

export async function archiveNotification(notificationId, userId) {
  return prisma.notification.update({
    where: { id: notificationId, userId },
    data: { archivedAt: new Date() },
  });
}

export async function deleteNotification(notificationId, userId) {
  return prisma.notification.delete({
    where: { id: notificationId, userId },
  });
}

export async function getNotificationById(notificationId, userId) {
  return prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });
}

// For notification generation service
export async function listActiveUsersWithHousehold() {
  return prisma.user.findMany({
    where: { activeHouseholdId: { not: null } },
    select: { id: true, activeHouseholdId: true, timezone: true },
  });
}