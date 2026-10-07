import { AppError, ErrorCodes } from '../../shared/errors.js';
import { fieldError, throwValidationError } from '../validators/shared.js';
import * as themeRepository from '../repositories/themeRepository.js';

function presentTheme(theme) {
  return {
    slug: theme.slug,
    name: theme.name,
    mood: theme.mood,
    mode: theme.mode,
    isDefault: theme.isDefault,
    sortOrder: theme.sortOrder,
    tokens: theme.tokens,
  };
}

function presentResolved(pref, theme) {
  return {
    colorMode: pref?.colorMode ?? 'SYSTEM',
    density: pref?.density ?? 'COMFORTABLE',
    navStyle: pref?.navStyle ?? 'SIDEBAR',
    themeSlug: theme.slug,
    overrides: pref?.themeOverrides ?? null,
    theme: {
      slug: theme.slug,
      name: theme.name,
      mode: theme.mode,
      tokens: theme.tokens,
    },
  };
}

// Public: presets for the appearance picker and login-page theming.
export async function getPresets() {
  const themes = await themeRepository.listThemes();
  return { presets: themes.map(presentTheme) };
}

// Current user's resolved appearance (read-only — never creates a row).
export async function getMine(userId) {
  const [pref, defaultTheme] = await Promise.all([
    themeRepository.findPreferenceByUserId(userId),
    themeRepository.findDefaultTheme(),
  ]);
  if (!defaultTheme) {
    throw new AppError('No theme presets are installed.', {
      code: ErrorCodes.NOT_FOUND,
      status: 404,
    });
  }
  const theme = pref?.themeId
    ? (await themeRepository.findThemeBySlug(pref.themeId)) ?? defaultTheme
    : defaultTheme;
  return presentResolved(pref, theme);
}

// Partial update; omitted fields keep their current value.
export async function updateMine(userId, updates) {
  const data = {};

  if (updates.colorMode !== undefined) {
    data.colorMode = updates.colorMode;
  }
  if (updates.density !== undefined) {
    data.density = updates.density;
  }
  if (updates.navStyle !== undefined) {
    data.navStyle = updates.navStyle;
  }
  if (updates.overrides !== undefined) {
    data.themeOverrides = updates.overrides;
  }
  if (updates.themeSlug !== undefined) {
    if (updates.themeSlug === null) {
      const defaultTheme = await themeRepository.findDefaultTheme();
      if (defaultTheme) {
        data.themeId = defaultTheme.id;
      }
    } else {
      const theme = await themeRepository.findThemeBySlug(updates.themeSlug);
      if (!theme) {
        throwValidationError([fieldError('themeSlug', 'Unknown theme preset.')]);
      }
      data.themeId = theme.id;
    }
  }

  if (Object.keys(data).length === 0) {
    return getMine(userId);
  }

  await themeRepository.upsertPreference(userId, data);
  return getMine(userId);
}

// Full reset: drops stored appearance preferences (idempotent).
export async function resetMine(userId) {
  await themeRepository.deletePreference(userId);
  return getMine(userId);
}
