import { listThemes, getMyTheme, updateMyTheme, resetMyTheme } from '../api/themes.js';

/* Theme engine — single source of truth for appearance on the client.
   Loads the user's resolved theme (or the public default), applies preset
   tokens + overrides onto <html> as inline custom properties, keeps the
   data-* attributes in sync and mirrors everything into localStorage so
   js/theme/boot.js can paint without a flash. */

const STORAGE_KEY = 'hd.theme.v1';
const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: dark)');

const DEFAULTS = {
  colorMode: 'SYSTEM',
  density: 'COMFORTABLE',
  navStyle: 'SIDEBAR',
  slug: 'rose_garden',
  presetMode: 'BOTH',
  overrides: null,
};

let state = {
  ...DEFAULTS,
  sidebar: 'expanded',
  tokens: null,
  authenticated: false,
};

let appliedKeys = new Set();
const listeners = new Set();

/* ---- color helpers (WCAG) ---- */

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function bestForeground(background) {
  if (typeof background !== 'string' || !background.startsWith('#')) {
    return '#ffffff';
  }
  return contrast('#ffffff', background) >= contrast('#191416', background)
    ? '#ffffff'
    : '#191416';
}

/* ---- state ---- */

function isDark() {
  if (state.presetMode === 'DARK') {
    return true;
  }
  if (state.colorMode === 'DARK') {
    return true;
  }
  if (state.colorMode === 'LIGHT') {
    return false;
  }
  return media.matches;
}

function tokensFor(mode) {
  const tokens = state.tokens || {};
  return tokens[mode] || tokens.dark || tokens.light || {};
}

function mergedVars(mode) {
  const merged = { ...tokensFor(mode) };
  if (state.overrides) {
    for (const [key, value] of Object.entries(state.overrides)) {
      merged[key] = value;
    }
  }
  return merged;
}

function persistCache() {
  try {
    const light = mergedVars('light');
    const dark = mergedVars('dark');
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        colorMode: state.colorMode,
        density: state.density,
        navStyle: state.navStyle,
        sidebar: state.sidebar,
        slug: state.slug,
        presetMode: state.presetMode,
        overrides: state.overrides,
        tokens: state.tokens,
        vars: { light, dark },
        onColors: {
          light: {
            primary: bestForeground(light['--color-primary']),
            danger: bestForeground(light['--color-danger']),
          },
          dark: {
            primary: bestForeground(dark['--color-primary']),
            danger: bestForeground(dark['--color-danger']),
          },
        },
      }),
    );
  } catch {
    // Storage full or blocked — first paint falls back to the static preset.
  }
}

function notify() {
  for (const listener of listeners) {
    listener(state);
  }
}

function apply() {
  const dark = isDark();
  const mode = dark ? 'dark' : 'light';

  if (state.tokens) {
    const vars = mergedVars(mode);
    for (const key of appliedKeys) {
      if (!(key in vars)) {
        root.style.removeProperty(key);
      }
    }
    appliedKeys = new Set(Object.keys(vars));
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
    const onPrimary = bestForeground(vars['--color-primary']);
    const onDanger = bestForeground(vars['--color-danger']);
    root.style.setProperty('--color-on-primary', onPrimary);
    root.style.setProperty('--color-on-danger', onDanger);
    appliedKeys.add('--color-on-primary');
    appliedKeys.add('--color-on-danger');
  }

  root.setAttribute('data-color-mode', mode);
  root.setAttribute('data-density', state.density.toLowerCase());
  root.setAttribute('data-nav-style', state.navStyle.toLowerCase());
  root.setAttribute('data-sidebar', state.sidebar);
  root.setAttribute('data-theme', state.slug);

  persistCache();
  notify();
}

function seedFromCache() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const cached = JSON.parse(raw);
    if (!cached || cached.v !== 1) {
      return;
    }
    state.colorMode = cached.colorMode || state.colorMode;
    state.density = cached.density || state.density;
    state.navStyle = cached.navStyle || state.navStyle;
    state.sidebar = cached.sidebar || state.sidebar;
    state.slug = cached.slug || state.slug;
    state.presetMode = cached.presetMode || state.presetMode;
    state.overrides = cached.overrides ?? null;
    state.tokens = cached.tokens ?? null;
  } catch {
    // Corrupted cache — keep defaults.
  }
}

function adoptMine(mine) {
  state.authenticated = true;
  state.colorMode = mine.colorMode;
  state.density = mine.density;
  state.navStyle = mine.navStyle;
  state.slug = mine.themeSlug;
  state.presetMode = mine.theme.mode;
  state.overrides = mine.overrides;
  state.tokens = mine.theme.tokens;
}

async function adoptPublicCatalog() {
  const { presets } = await listThemes();
  const preset =
    presets.find((p) => p.slug === state.slug) ||
    presets.find((p) => p.isDefault) ||
    presets[0];
  if (preset) {
    state.slug = preset.slug;
    state.presetMode = preset.mode;
    state.tokens = preset.tokens;
    state.overrides = null;
  }
}

async function persist(patch) {
  const mine = await updateMyTheme(patch);
  adoptMine(mine);
  apply();
}

async function recoverAfterFailure() {
  try {
    const mine = await getMyTheme();
    adoptMine(mine);
  } catch {
    // Still failing (offline) — keep the optimistic local state.
  }
  apply();
}

/* ---- public API ---- */

export async function initTheme() {
  seedFromCache();
  try {
    const mine = await getMyTheme();
    adoptMine(mine);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      state.authenticated = false;
      try {
        await adoptPublicCatalog();
      } catch {
        // Offline: static fallback in css/themes.css covers the paint.
      }
    } else {
      try {
        await adoptPublicCatalog();
      } catch {
        // Keep the cached tokens when the network is unavailable.
      }
    }
  }
  apply();
  return state;
}

export function getThemeState() {
  return state;
}

export function isAuthenticatedTheme() {
  return state.authenticated;
}

export function onThemeChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentColorMode() {
  return isDark() ? 'dark' : 'light';
}

export async function setColorMode(colorMode) {
  state.colorMode = colorMode;
  apply();
  if (state.authenticated) {
    try {
      await persist({ colorMode });
    } catch (error) {
      await recoverAfterFailure();
      throw error;
    }
  }
}

export async function setDensity(density) {
  state.density = density;
  apply();
  if (state.authenticated) {
    try {
      await persist({ density });
    } catch (error) {
      await recoverAfterFailure();
      throw error;
    }
  }
}

export async function setNavStyle(navStyle) {
  state.navStyle = navStyle;
  apply();
  if (state.authenticated) {
    try {
      await persist({ navStyle });
    } catch (error) {
      await recoverAfterFailure();
      throw error;
    }
  }
}

export async function setPreset(slug) {
  if (state.authenticated) {
    await persist({ themeSlug: slug });
    return;
  }
  const { presets } = await listThemes();
  const preset = presets.find((p) => p.slug === slug);
  if (!preset) {
    throw new Error(`Unknown theme preset: ${slug}`);
  }
  state.slug = preset.slug;
  state.presetMode = preset.mode;
  state.tokens = preset.tokens;
  state.overrides = null;
  apply();
}

export async function setOverrides(overrides) {
  if (state.authenticated) {
    await persist({ overrides });
    return;
  }
  state.overrides = overrides;
  apply();
}

export async function resetAppearance() {
  if (state.authenticated) {
    const mine = await resetMyTheme();
    adoptMine(mine);
    apply();
    return;
  }
  state.overrides = null;
  state.colorMode = 'SYSTEM';
  await adoptPublicCatalog().catch(() => {});
  apply();
}

// Local-only: sidebar collapse preference (not a server setting).
export function setSidebar(collapsed) {
  state.sidebar = collapsed ? 'collapsed' : 'expanded';
  apply();
}

// Cycles SYSTEM → LIGHT → DARK → SYSTEM and persists the choice.
export async function cycleColorMode() {
  const order = ['SYSTEM', 'LIGHT', 'DARK'];
  const next = order[(order.indexOf(state.colorMode) + 1) % order.length];
  await setColorMode(next);
  return next;
}

media.addEventListener('change', () => {
  if (state.colorMode === 'SYSTEM') {
    apply();
  }
});
