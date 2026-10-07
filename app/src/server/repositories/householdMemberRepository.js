import { prisma } from '../utils/prisma.js';

const MEMBER_INCLUDE = {
  user: { select: { id: true, email: true, name: true } },
};

export function findByHouseholdAndUser(householdId, userId) {
  return prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
  });
}

export function listByHousehold(householdId) {
  return prisma.householdMember.findMany({
    where: { householdId },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    include: MEMBER_INCLUDE,
  });
}

export function listByUser(userId) {
  return prisma.householdMember.findMany({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
    include: { household: { select: { id: true, name: true } } },
  });
}

export function countByHouseholdIds(householdIds) {
  if (householdIds.length === 0) {
    return Promise.resolve([]);
  }
  return prisma.householdMember.groupBy({
    by: ['householdId'],
    where: { householdId: { in: householdIds } },
    _count: { userId: true },
  });
}

export function create({ householdId, userId, role = 'MEMBER' }) {
  return prisma.householdMember.create({ data: { householdId, userId, role } });
}

export function updateRole(householdId, userId, role) {
  return prisma.householdMember.update({
    where: { householdId_userId: { householdId, userId } },
    data: { role },
  });
}

export function deleteByHouseholdAndUser(householdId, userId) {
  return prisma.householdMember.deleteMany({
    where: { householdId, userId },
  });
}

// Transfers ownership atomically: the target becomes OWNER, the previous owner
// is demoted to ADMIN and the household's owner reference is updated.
export function transferOwnership(householdId, previousOwnerUserId, newOwnerUserId) {
  return prisma.$transaction(async (tx) => {
    await tx.householdMember.update({
      where: { householdId_userId: { householdId, userId: newOwnerUserId } },
      data: { role: 'OWNER' },
    });
    await tx.householdMember.update({
      where: { householdId_userId: { householdId, userId: previousOwnerUserId } },
      data: { role: 'ADMIN' },
    });
    const household = await tx.household.update({
      where: { id: householdId },
      data: { ownerUserId: newOwnerUserId },
    });
    return household;
  });
}
