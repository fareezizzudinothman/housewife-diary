import { prisma } from '../utils/prisma.js';

export function findById(id) {
  return prisma.household.findUnique({ where: { id } });
}

export function create({ name, ownerUserId }) {
  return prisma.household.create({ data: { name, ownerUserId } });
}

// Creates a household, its OWNER membership and (optionally) sets it as the
// creator's active household in one transaction.
export function createWithOwner({ name, ownerUserId, setActive = true }) {
  return prisma.$transaction(async (tx) => {
    const household = await tx.household.create({ data: { name, ownerUserId } });
    await tx.householdMember.create({
      data: { householdId: household.id, userId: ownerUserId, role: 'OWNER' },
    });
    if (setActive) {
      await tx.user.update({
        where: { id: ownerUserId },
        data: { activeHouseholdId: household.id },
      });
    }
    return household;
  });
}

export function updateOwner(id, ownerUserId) {
  return prisma.household.update({ where: { id }, data: { ownerUserId } });
}

export function listForUser(userId) {
  return prisma.household.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: 'asc' },
  });
}
