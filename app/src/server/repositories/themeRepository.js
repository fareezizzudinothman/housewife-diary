import { prisma } from '../utils/prisma.js';

export function listThemes() {
  return prisma.theme.findMany({ orderBy: { sortOrder: 'asc' } });
}

export function findThemeBySlug(slug) {
  return prisma.theme.findUnique({ where: { slug } });
}

export function findDefaultTheme() {
  return prisma.theme.findFirst({ where: { isDefault: true } });
}

export function findPreferenceByUserId(userId) {
  return prisma.userPreference.findUnique({ where: { userId } });
}

// Creates the row on first write, otherwise updates it in place.
export function upsertPreference(userId, data) {
  return prisma.userPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

// Idempotent reset: removing a missing row is not an error.
export function deletePreference(userId) {
  return prisma.userPreference.deleteMany({ where: { userId } });
}
