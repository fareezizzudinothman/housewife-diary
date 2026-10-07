import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import {
  getThemeState,
  currentColorMode,
  onThemeChange,
  setColorMode,
  setDensity,
  setNavStyle,
  setPreset,
  setOverrides,
  resetAppearance,
} from '../theme/engine.js';
import { listThemes } from '../api/themes.js';
import { initSegmented } from '../components/segmented.js';
import { confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { describeError } from '../utils/forms.js';

/* Appearance settings — presets, color mode, density, navigation and
   per-preset custom overrides. Everything persists through the theme
   engine (optimistic locally, PATCH /themes/me when signed in). */

const COLOR_FIELDS = [
  ['--color-primary', 'Primary'],
  ['--color-secondary', 'Secondary'],
  ['--color-accent', 'Accent'],
  ['--color-background', 'Background'],
  ['--color-surface', 'Card surface'],
  ['--color-surface-alt', 'Subtle surface'],
  ['--color-text', 'Text'],
  ['--color-text-muted', 'Muted text'],
  ['--color-border', 'Border'],
];

const grid = document.querySelector('[data-preset-grid]');
const colorWrap = document.querySelector('[data-color-fields]');
const modeHint = document.querySelector('[data-mode-hint]');
const overrideStatus = document.querySelector('[data-override-status]');
const clearButton = document.querySelector('[data-clear-overrides]');
const resetButton = document.querySelector('[data-reset-appearance]');

let presets = [];
let colorModeControl = null;
let densityControl = null;
let navStyleControl = null;

async function guard(action) {
  try {
    await action();
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  }
}

function previewMode(state) {
  if (state.presetMode === 'DARK') {
    return 'dark';
  }
  if (state.presetMode === 'LIGHT') {
    return 'light';
  }
  return currentColorMode();
}

function tokensFor(preset, mode) {
  return preset.tokens?.[mode] ?? preset.tokens?.light ?? {};
}

function toColorInput(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) {
    return '#000000';
  }
  const body = hex.slice(1);
  if (body.length === 3) {
    return `#${body.split('').map((c) => c + c).join('')}`;
  }
  if (body.length === 6) {
    return `#${body}`;
  }
  return '#000000';
}

function currentRadius(key, fallback) {
  const raw = getThemeState().overrides?.[key];
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/* ---- rendering ---- */

function buildPresetGrid() {
  grid.innerHTML = '';
  for (const preset of presets) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset-card';
    button.dataset.preset = preset.slug;
    button.innerHTML = `
      <span class="preset-card__preview" data-preview>
        <span class="preset-card__swatch" data-swatch="--color-primary"></span>
        <span class="preset-card__swatch" data-swatch="--color-secondary"></span>
        <span class="preset-card__swatch" data-swatch="--color-accent"></span>
      </span>
      <strong></strong>
      <small></small>`;
    button.querySelector('strong').textContent = preset.name;
    button.querySelector('small').textContent = preset.mood ?? preset.mode.toLowerCase();
    button.addEventListener('click', () => {
      guard(() => setPreset(preset.slug));
    });
    grid.append(button);
  }
}

function buildColorFields() {
  colorWrap.innerHTML = '';
  for (const [key, label] of COLOR_FIELDS) {
    const row = document.createElement('div');
    row.className = 'color-field';

    const input = document.createElement('input');
    input.type = 'color';
    input.id = `override-${key.replace(/^--color-/, '')}`;
    input.dataset.colorKey = key;
    input.addEventListener('change', () => {
      guard(async () => {
        const overrides = { ...(getThemeState().overrides ?? {}), [key]: input.value };
        await setOverrides(overrides);
        setStatus('Saved.');
      });
    });

    const text = document.createElement('span');
    text.className = 'color-field__text';
    const labelEl = document.createElement('label');
    labelEl.htmlFor = input.id;
    labelEl.textContent = label;
    const code = document.createElement('small');
    code.textContent = key;
    text.append(labelEl, code);

    row.append(input, text);
    colorWrap.append(row);
  }
}

function setStatus(message) {
  overrideStatus.textContent = message;
}

function render() {
  const state = getThemeState();
  const locked = state.presetMode === 'DARK';
  const mode = previewMode(state);

  colorModeControl?.select(state.colorMode, { silent: true });
  densityControl?.select(state.density, { silent: true });
  navStyleControl?.select(state.navStyle, { silent: true });

  for (const button of document.querySelectorAll('[data-segmented="colorMode"] .segmented__option')) {
    button.disabled = locked;
  }
  modeHint.hidden = !locked;

  for (const card of grid.querySelectorAll('.preset-card')) {
    const preset = presets.find((p) => p.slug === card.dataset.preset);
    if (!preset) {
      continue;
    }
    const tokens = tokensFor(preset, mode);
    card.setAttribute('aria-pressed', String(preset.slug === state.slug));
    card.querySelector('[data-preview]').style.background = tokens['--color-background'] ?? '';
    for (const swatch of card.querySelectorAll('[data-swatch]')) {
      swatch.style.background = tokens[swatch.dataset.swatch] ?? '';
    }
  }

  const activeTokens = state.tokens?.[mode] ?? {};
  for (const input of colorWrap.querySelectorAll('[data-color-key]')) {
    const key = input.dataset.colorKey;
    input.value = toColorInput(state.overrides?.[key] ?? activeTokens[key]);
  }

  const cardRadius = currentRadius('--radius-card', 18);
  const controlRadius = currentRadius('--radius-control', 10);
  const cardInput = document.querySelector('[data-radius="--radius-card"]');
  const controlInput = document.querySelector('[data-radius="--radius-control"]');
  cardInput.value = String(cardRadius);
  controlInput.value = String(controlRadius);
  document.querySelector('[data-radius-card-output]').textContent = `${cardRadius}px`;
  document.querySelector('[data-radius-control-output]').textContent = `${controlRadius}px`;

  const overrideCount = Object.keys(state.overrides ?? {}).length;
  clearButton.disabled = overrideCount === 0;
}

/* ---- wiring ---- */

function wireControls() {
  colorModeControl = initSegmented(document.querySelector('[data-segmented="colorMode"]'), (value) => {
    guard(() => setColorMode(value));
  });
  densityControl = initSegmented(document.querySelector('[data-segmented="density"]'), (value) => {
    guard(() => setDensity(value));
  });
  navStyleControl = initSegmented(document.querySelector('[data-segmented="navStyle"]'), (value) => {
    guard(() => setNavStyle(value));
  });

  for (const input of document.querySelectorAll('[data-radius]')) {
    const key = input.dataset.radius;
    const output = document.querySelector(`[data-${key.replace(/^--/, '')}-output]`);
    input.addEventListener('input', () => {
      output.textContent = `${input.value}px`;
    });
    input.addEventListener('change', () => {
      guard(async () => {
        const overrides = { ...(getThemeState().overrides ?? {}), [key]: `${input.value}px` };
        await setOverrides(overrides);
        setStatus('Saved.');
      });
    });
  }

  clearButton.addEventListener('click', () => {
    guard(async () => {
      await setOverrides(null);
      setStatus('Custom colors cleared.');
      toast('Custom colors cleared.', { type: 'success' });
    });
  });

  resetButton.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Reset appearance?',
      message: 'Your theme, custom colors and layout settings return to their defaults.',
      confirmLabel: 'Reset',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    guard(async () => {
      await resetAppearance();
      setStatus('');
      toast('Appearance reset to defaults.', { type: 'success' });
    });
  });
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);

  const { presets: catalog } = await listThemes();
  presets = catalog;

  buildPresetGrid();
  buildColorFields();
  wireControls();
  render();
  onThemeChange(render);
}

init().catch((error) => toast(describeError(error), { type: 'error' }));
