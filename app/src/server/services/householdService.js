import { Prisma } from '@prisma/client';
import { AppError, ErrorCodes } from '../../shared/errors.js';
import { hasAtLeast } from '../../shared/roles.js';
import * as householdRepository from '../repositories/householdRepository.js';
import * as householdMemberRepository from '../repositories/householdMemberRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import { logAuthEvent } from '../utils/audit.js';

// All household lookups go through this gate: a user who is not a member of
// the household gets 404 (never 403 — no existence leaks across households).
async function requireMembership(householdId, userId) {
  const [household, membership] = await Promise.all([
    householdRepository.findById(householdId),
    householdMemberRepository.findByHouseholdAndUser(householdId, userId),
  ]);
  if (!household || !membership) {
    throw new AppError('Household not found.', {
      code: ErrorCodes.NOT_FOUND,
      status: 404,
    });
  }
  return { household, membership };
}

function requireRole(membership, minimumRole, message) {
  if (!hasAtLeast(membership.role, minimumRole)) {
    throw new AppError(message, {
      code: ErrorCodes.FORBIDDEN,
      status: 403,
    });
  }
}

async function clearActiveHouseholdIfCurrent(userId, householdId) {
  const user = await userRepository.findById(userId);
  if (user?.activeHouseholdId === householdId) {
    await userRepository.updateProfile(userId, { activeHouseholdId: null });
  }
}

function toMemberView(member, ownerUserId) {
  return {
    userId: member.user.id,
    email: member.user.email,
    name: member.user.name,
    role: member.role,
    joinedAt: member.joinedAt,
    isOwner: member.userId === ownerUserId,
  };
}

export async function createHousehold({ user, name }) {
  const setActive = !user.activeHouseholdId;
  const household = await householdRepository.createWithOwner({
    name,
    ownerUserId: user.id,
    setActive,
  });
  logAuthEvent('household_created', { userId: user.id, householdId: household.id });
  return {
    household: {
      id: household.id,
      name: household.name,
      ownerUserId: household.ownerUserId,
      createdAt: household.createdAt,
      updatedAt: household.updatedAt,
    },
    role: 'OWNER',
    activeHouseholdId: setActive ? household.id : user.activeHouseholdId,
  };
}

export async function listMyHouseholds(user) {
  const memberships = await householdMemberRepository.listByUser(user.id);
  const counts = await householdMemberRepository.countByHouseholdIds(
    memberships.map((membership) => membership.householdId),
  );
  const memberCounts = new Map(counts.map((row) => [row.householdId, row._count.userId]));
  return memberships.map((membership) => ({
    householdId: membership.householdId,
    name: membership.household.name,
    role: membership.role,
    memberCount: memberCounts.get(membership.householdId) ?? 0,
    isActive: membership.householdId === user.activeHouseholdId,
  }));
}

export async function getHousehold({ user, householdId }) {
  const { household } = await requireMembership(householdId, user.id);
  const members = await householdMemberRepository.listByHousehold(householdId);
  return {
    household: {
      id: household.id,
      name: household.name,
      ownerUserId: household.ownerUserId,
      createdAt: household.createdAt,
      updatedAt: household.updatedAt,
    },
    members: members.map((member) => toMemberView(member, household.ownerUserId)),
  };
}

export async function switchActiveHousehold({ user, householdId }) {
  const { household } = await requireMembership(householdId, user.id);
  await userRepository.updateProfile(user.id, { activeHouseholdId: household.id });
  return { activeHouseholdId: household.id };
}

export async function listMembers({ user, householdId }) {
  const { household } = await requireMembership(householdId, user.id);
  const members = await householdMemberRepository.listByHousehold(householdId);
  return members.map((member) => toMemberView(member, household.ownerUserId));
}

export async function addMember({ user, householdId, email, role }) {
  const { membership: actorMembership } = await requireMembership(householdId, user.id);
  requireRole(
    actorMembership,
    'ADMIN',
    'Only the owner or an admin can add members to this household.',
  );
  // Only the owner may grant the ADMIN role.
  if (role === 'ADMIN' && actorMembership.role !== 'OWNER') {
    throw new AppError('Only the household owner can grant the admin role.', {
      code: ErrorCodes.FORBIDDEN,
      status: 403,
    });
  }
  const targetUser = await userRepository.findByEmail(email);
  if (!targetUser) {
    throw new AppError('No registered user was found with that email.', {
      code: ErrorCodes.NOT_FOUND,
      status: 404,
    });
  }
  const existingMembership = await householdMemberRepository.findByHouseholdAndUser(
    householdId,
    targetUser.id,
  );
  if (existingMembership) {
    throw new AppError('That user is already a member of this household.', {
      code: ErrorCodes.CONFLICT,
      status: 409,
    });
  }
  try {
    const member = await householdMemberRepository.create({
      householdId,
      userId: targetUser.id,
      role,
    });
    logAuthEvent('household_member_added', {
      householdId,
      actorUserId: user.id,
      addedUserId: targetUser.id,
      role,
    });
    return { userId: targetUser.id, email, name: targetUser.name, role: member.role, joinedAt: member.joinedAt };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('That user is already a member of this household.', {
        code: ErrorCodes.CONFLICT,
        status: 409,
      });
    }
    throw error;
  }
}

export async function updateMemberRole({ user, householdId, targetUserId, role }) {
  const { membership: actorMembership } = await requireMembership(householdId, user.id);
  const targetMembership = await householdMemberRepository.findByHouseholdAndUser(
    householdId,
    targetUserId,
  );
  if (!targetMembership) {
    throw new AppError('Member not found.', {
      code: ErrorCodes.NOT_FOUND,
      status: 404,
    });
  }

  if (role === 'OWNER') {
    // Ownership transfer — only the current owner may do this.
    if (actorMembership.role !== 'OWNER') {
      throw new AppError('Only the household owner can transfer ownership.', {
        code: ErrorCodes.FORBIDDEN,
        status: 403,
      });
    }
    if (targetMembership.userId === actorMembership.userId) {
      throw new AppError('You are already the owner of this household.', {
        code: ErrorCodes.CONFLICT,
        status: 409,
      });
    }
    const household = await householdMemberRepository.transferOwnership(
      householdId,
      actorMembership.userId,
      targetUserId,
    );
    logAuthEvent('household_ownership_transferred', {
      householdId,
      previousOwnerUserId: actorMembership.userId,
      newOwnerUserId: targetUserId,
    });
    return {
      household: {
        id: household.id,
        name: household.name,
        ownerUserId: household.ownerUserId,
        createdAt: household.createdAt,
        updatedAt: household.updatedAt,
      },
    };
  }

  if (role === 'ADMIN') {
    // Only the owner may grant (or revoke) the admin role.
    if (actorMembership.role !== 'OWNER') {
      throw new AppError('Only the household owner can assign the admin role.', {
        code: ErrorCodes.FORBIDDEN,
        status: 403,
      });
    }
  } else {
    // MEMBER/VIEWER changes require at least an admin.
    requireRole(actorMembership, 'ADMIN', 'Only the owner or an admin can change member roles.');
  }
  // An admin cannot touch the owner's or another admin's membership.
  if (actorMembership.role === 'ADMIN' && hasAtLeast(targetMembership.role, 'ADMIN')) {
    throw new AppError('An admin can only change the roles of members and viewers.', {
      code: ErrorCodes.FORBIDDEN,
      status: 403,
    });
  }
  if (targetMembership.role === 'OWNER' && role !== 'OWNER') {
    // Reached only if the actor is the owner demoting themselves.
    throw new AppError('Transfer ownership to another member before giving up the owner role.', {
      code: ErrorCodes.CONFLICT,
      status: 409,
    });
  }
  const updated = await householdMemberRepository.updateRole(householdId, targetUserId, role);
  logAuthEvent('household_member_role_changed', {
    householdId,
    actorUserId: user.id,
    targetUserId,
    role,
  });
  return { userId: targetUserId, role: updated.role, joinedAt: updated.joinedAt };
}

export async function removeMember({ user, householdId, targetUserId }) {
  const { membership: actorMembership } = await requireMembership(householdId, user.id);
  const targetMembership = await householdMemberRepository.findByHouseholdAndUser(
    householdId,
    targetUserId,
  );
  if (!targetMembership) {
    throw new AppError('Member not found.', {
      code: ErrorCodes.NOT_FOUND,
      status: 404,
    });
  }

  if (actorMembership.userId === targetUserId) {
    return leave({ user, householdId });
  }

  requireRole(
    actorMembership,
    'ADMIN',
    'Only the owner or an admin can remove members from this household.',
  );
  if (actorMembership.role === 'ADMIN' && hasAtLeast(targetMembership.role, 'ADMIN')) {
    throw new AppError('An admin can only remove members and viewers.', {
      code: ErrorCodes.FORBIDDEN,
      status: 403,
    });
  }
  await householdMemberRepository.deleteByHouseholdAndUser(householdId, targetUserId);
  await clearActiveHouseholdIfCurrent(targetUserId, householdId);
  logAuthEvent('household_member_removed', {
    householdId,
    actorUserId: user.id,
    removedUserId: targetUserId,
  });
  return { removedUserId: targetUserId };
}

export async function leave({ user, householdId }) {
  const { membership } = await requireMembership(householdId, user.id);
  if (membership.role === 'OWNER') {
    throw new AppError(
      'The owner cannot leave the household. Transfer ownership to another member first.',
      { code: ErrorCodes.CONFLICT, status: 409 },
    );
  }
  await householdMemberRepository.deleteByHouseholdAndUser(householdId, user.id);
  await clearActiveHouseholdIfCurrent(user.id, householdId);
  logAuthEvent('household_member_left', { householdId, userId: user.id });
  return { leftHouseholdId: householdId };
}
