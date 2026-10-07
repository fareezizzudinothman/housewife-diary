import * as diaryRepository from '../repositories/diaryRepository.js';
import * as householdRepository from '../repositories/householdRepository.js';
import * as householdMemberRepository from '../repositories/householdMemberRepository.js';

// Modules that are not implemented yet are reported explicitly so the
// dashboard can render a graceful placeholder instead of fake data.
const NOT_AVAILABLE_MODULES = ['tasks', 'calendar', 'meals', 'shopping', 'inventory', 'finance'];

function toRecentEntryView(entry) {
  return {
    id: entry.id,
    title: entry.title,
    entryDate: entry.entryDate.toISOString().slice(0, 10),
    timeOfDay: entry.timeOfDay,
    mood: entry.mood ? { id: entry.mood.id, name: entry.mood.name } : null,
    attachmentCount: entry._count.attachments,
    createdAt: entry.createdAt,
  };
}

export async function getDashboard({ user, householdId, householdRole }) {
  const scope = { householdId, userId: user.id };

  const [household, memberCounts, diaryCount, recentEntries] = await Promise.all([
    householdRepository.findById(householdId),
    householdMemberRepository.countByHouseholdIds([householdId]),
    diaryRepository.countEntries(scope),
    diaryRepository.listEntries(scope, { page: 1, limit: 5 }),
  ]);

  const dashboard = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      timezone: user.timezone ?? 'UTC',
    },
    household: household
      ? {
          id: household.id,
          name: household.name,
          role: householdRole,
          memberCount: memberCounts.find((row) => row.householdId === householdId)?._count
            .userId ?? 0,
        }
      : null,
    diary: {
      status: diaryCount > 0 ? 'available' : 'empty',
      count: diaryCount,
      recent: recentEntries.map(toRecentEntryView),
    },
  };

  for (const moduleName of NOT_AVAILABLE_MODULES) {
    dashboard[moduleName] = { status: 'not_available' };
  }

  return dashboard;
}
