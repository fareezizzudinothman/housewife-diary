import { fieldError, throwValidationError } from './shared.js';

// Allowlist of variables a user may override (docs/theme-system.md).
// Everything else is rejected so overrides can never inject arbitrary
// CSS (no var(), urls, expressions…).
export const OVERRIDE_COLOR_KEYS = Object.freeze([
  '--color-primary',
  '--color-secondary',
  '--color-accent',
  '--color-background',
  '--color-surface',
  '--color-surface-alt',
  '--color-text',
  '--color-text-muted',
  '--color-border',
]);

export const OVERRIDE_RADIUS_KEYS = Object.freeze(['--radius-card', '--radius-control']);

export const OVERRIDE_KEYS = new Set([...OVERRIDE_COLOR_KEYS, ...OVERRIDE_RADIUS_KEYS]);

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SLUG_PATTERN = /^[a-z0-9_]{1,40}$/;
const MAX_OVERRIDE_KEYS = OVERRIDE_COLOR_KEYS.length + OVERRIDE_RADIUS_KEYS.length;

const COLOR_MODES = new Set(['LIGHT', 'DARK', 'SYSTEM']);
const DENSITIES = new Set(['COMPACT', 'COMFORTABLE']);
const NAV_STYLES = new Set(['SIDEBAR', 'BOTTOM']);

const TOP_LEVEL_FIELDS = new Set(['colorMode', 'density', 'navStyle', 'themeSlug', 'overrides']);

function readEnum(errors, field, value, allowed) {
  if (typeof value !== 'string') {
    errors.push(fieldError(field, 'Invalid value.'));
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  if (!allowed.has(normalized)) {
    errors.push(fieldError(field, 'Invalid value.'));
    return undefined;
  }
  return normalized;
}

// Accepts 12, "12" or "12px" and normalizes to "12px" (0–40).
function normalizeRadius(errors, field, value) {
  let n;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    const match = /^(\d{1,2})(?:px)?$/.exec(value.trim());
    n = match ? Number(match[1]) : NaN;
  } else {
    n = NaN;
  }
  if (!Number.isInteger(n) || n < 0 || n > 40) {
    errors.push(fieldError(field, 'Radius must be between 0px and 40px.'));
    return undefined;
  }
  return `${n}px`;
}

function normalizeOverrides(errors, value) {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    errors.push(fieldError('overrides', 'Overrides must be an object.'));
    return undefined;
  }
  const keys = Object.keys(value);
  if (keys.length > MAX_OVERRIDE_KEYS) {
    errors.push(fieldError('overrides', 'Too many override variables.'));
    return undefined;
  }
  const normalized = {};
  for (const key of keys) {
    if (!OVERRIDE_KEYS.has(key)) {
      errors.push(fieldError(`overrides.${key}`, 'This variable cannot be overridden.'));
      continue;
    }
    const raw = value[key];
    if (OVERRIDE_RADIUS_KEYS.includes(key)) {
      const radius = normalizeRadius(errors, `overrides.${key}`, raw);
      if (radius !== undefined) {
        normalized[key] = radius;
      }
      continue;
    }
    if (typeof raw !== 'string' || !HEX_COLOR.test(raw.trim())) {
      errors.push(
        fieldError(`overrides.${key}`, 'Expected a hex color such as #a1b2c3.'),
      );
      continue;
    }
    normalized[key] = raw.trim().toLowerCase();
  }
  return normalized;
}

export function validateThemeUpdate(input) {
  const errors = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throwValidationError([fieldError('body', 'Request body must be an object.')]);
  }

  const updates = {};
  for (const key of Object.keys(input)) {
    if (!TOP_LEVEL_FIELDS.has(key)) {
      errors.push(fieldError(key, 'Unknown field.'));
    }
  }

  if (input.colorMode !== undefined) {
    const colorMode = readEnum(errors, 'colorMode', input.colorMode, COLOR_MODES);
    if (colorMode !== undefined) {
      updates.colorMode = colorMode;
    }
  }

  if (input.density !== undefined) {
    const density = readEnum(errors, 'density', input.density, DENSITIES);
    if (density !== undefined) {
      updates.density = density;
    }
  }

  if (input.navStyle !== undefined) {
    const navStyle = readEnum(errors, 'navStyle', input.navStyle, NAV_STYLES);
    if (navStyle !== undefined) {
      updates.navStyle = navStyle;
    }
  }

  if (input.themeSlug !== undefined) {
    if (input.themeSlug === null) {
      updates.themeSlug = null;
    } else if (typeof input.themeSlug === 'string' && SLUG_PATTERN.test(input.themeSlug.trim())) {
      updates.themeSlug = input.themeSlug.trim();
    } else {
      errors.push(fieldError('themeSlug', 'Unknown theme preset.'));
    }
  }

  if (input.overrides !== undefined) {
    const overrides = normalizeOverrides(errors, input.overrides);
    if (overrides !== undefined) {
      updates.overrides = overrides;
    }
  }

  if (errors.length) {
    throwValidationError(errors);
  }
  return updates;
}
