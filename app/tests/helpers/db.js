import { prisma } from '../../src/server/utils/prisma.js';

// Removes every test-created row for a dedicated test email domain.
// Households must go first (owner FK is RESTRICT); sessions, memberships and
// tokens cascade from their users.
export async function cleanupEmailDomain(domain) {
  const suffix = `@${domain}`;
  await prisma.household.deleteMany({ where: { owner: { email: { endsWith: suffix } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: suffix } } });
}

export async function findUserByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}

export { prisma };
