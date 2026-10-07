import { prisma } from '../utils/prisma.js';

// ---- Password reset tokens ----

export function createPasswordResetToken({ userId, tokenHash, expiresAt }) {
  return prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
}

export function findValidPasswordResetToken(tokenHash, now = new Date()) {
  return prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    include: { user: true },
  });
}

// Marks the token used; returns the updated row only if it was unused
// (updateMany + count makes the consumption race-safe and single-use).
export function consumePasswordResetToken(id, usedAt = new Date()) {
  return prisma.passwordResetToken
    .updateMany({ where: { id, usedAt: null }, data: { usedAt } })
    .then((result) => result.count === 1);
}

export function deletePasswordResetTokensForUser(userId) {
  return prisma.passwordResetToken.deleteMany({ where: { userId } });
}

// ---- Email verification tokens ----

export function createEmailVerificationToken({ userId, tokenHash, expiresAt }) {
  return prisma.emailVerificationToken.create({ data: { userId, tokenHash, expiresAt } });
}

export function findValidEmailVerificationToken(tokenHash, now = new Date()) {
  return prisma.emailVerificationToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    include: { user: true },
  });
}

export function consumeEmailVerificationToken(id, usedAt = new Date()) {
  return prisma.emailVerificationToken
    .updateMany({ where: { id, usedAt: null }, data: { usedAt } })
    .then((result) => result.count === 1);
}

export function deleteEmailVerificationTokensForUser(userId) {
  return prisma.emailVerificationToken.deleteMany({ where: { userId } });
}
