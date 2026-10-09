/**
 * AI Conversation Repository
 *
 * Data access layer for AI conversations and messages.
 */

import { prisma } from '../utils/prisma.js';

const CONVERSATION_SELECT = {
  id: true,
  householdId: true,
  userId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
};

const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  role: true,
  content: true,
  metadata: true,
  createdAt: true,
};

export async function createConversation({ householdId, userId, title }) {
  return prisma.aiConversation.create({
    data: { householdId, userId, title },
    select: CONVERSATION_SELECT,
  });
}

export async function findConversationById(id, householdId) {
  return prisma.aiConversation.findFirst({
    where: { id, householdId },
    select: CONVERSATION_SELECT,
  });
}

export async function findConversationWithMessages(id, householdId, messageLimit = 50) {
  return prisma.aiConversation.findFirst({
    where: { id, householdId },
    select: {
      ...CONVERSATION_SELECT,
      messages: {
        select: MESSAGE_SELECT,
        orderBy: { createdAt: 'asc' },
        take: messageLimit,
      },
    },
  });
}

export async function listConversations({ householdId, userId, page = 1, limit = 20 }) {
  const where = { householdId, userId };
  const [items, total] = await Promise.all([
    prisma.aiConversation.findMany({
      where,
      select: CONVERSATION_SELECT,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.aiConversation.count({ where }),
  ]);

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function updateConversationTimestamp(id) {
  return prisma.aiConversation.update({
    where: { id },
    data: { updatedAt: new Date() },
    select: CONVERSATION_SELECT,
  });
}

export async function updateConversationTitle(id, householdId, title) {
  return prisma.aiConversation.update({
    where: { id },
    data: { title, updatedAt: new Date() },
    select: CONVERSATION_SELECT,
  });
}

export async function deleteConversation(id, householdId) {
  return prisma.aiConversation.deleteMany({ where: { id, householdId } });
}

export async function createMessage({ conversationId, role, content, metadata = {} }) {
  return prisma.aiMessage.create({
    data: { conversationId, role, content, metadata },
    select: MESSAGE_SELECT,
  });
}

export async function findMessagesByConversation(conversationId, { limit = 50, before } = {}) {
  const where = { conversationId };
  if (before) {
    where.createdAt = { lt: new Date(before) };
  }
  return prisma.aiMessage.findMany({
    where,
    select: MESSAGE_SELECT,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function countMessagesByConversation(conversationId) {
  return prisma.aiMessage.count({ where: { conversationId } });
}

export async function deleteMessagesByConversation(conversationId) {
  return prisma.aiMessage.deleteMany({ where: { conversationId } });
}