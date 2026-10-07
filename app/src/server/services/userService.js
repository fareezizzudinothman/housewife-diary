import { AppError, ErrorCodes } from '../../shared/errors.js';
import * as userRepository from '../repositories/userRepository.js';
import * as householdMemberRepository from '../repositories/householdMemberRepository.js';

export async function getMe(user) {
  const memberships = await householdMemberRepository.listByUser(user.id);
  const counts = await householdMemberRepository.countByHouseholdIds(
    memberships.map((membership) => membership.householdId),
  );
  const memberCounts = new Map(counts.map((row) => [row.householdId, row._count.userId]));
  return {
    user: userRepository.toPublicUser(user),
    households: memberships.map((membership) => ({
      householdId: membership.householdId,
      name: membership.household.name,
      role: membership.role,
      memberCount: memberCounts.get(membership.householdId) ?? 0,
      isActive: membership.householdId === user.activeHouseholdId,
    })),
  };
}

export async function updateMe(user, updates) {
  if (updates.activeHouseholdId !== undefined) {
    // The active household must be one of the user's own households.
    const membership = await householdMemberRepository.findByHouseholdAndUser(
      updates.activeHouseholdId,
      user.id,
    );
    if (!membership) {
      // 404 (never 403) to avoid leaking the household's existence.
      throw new AppError('Household not found.', {
        code: ErrorCodes.NOT_FOUND,
        status: 404,
      });
    }
  }
  const updated = await userRepository.updateProfile(user.id, updates);
  return getMe(updated);
}
