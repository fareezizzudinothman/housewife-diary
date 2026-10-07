import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { prisma } from '../src/server/utils/prisma.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'themes.test.local';
let baseUrl;
let started;

before(async () => {
  started = await startTestServer();
  baseUrl = started.baseUrl;
});

after(async () => {
  await cleanupEmailDomain(DOMAIN);
  await started.stop();
});

beforeEach(() => {
  resetRateLimits();
  resetAuthThrottles();
  clearOutbox();
});

async function createUser(label) {
  const client = newClient(baseUrl);
  const { email } = await registerUser(client, { domain: DOMAIN, label });
  return { client, email };
}

// ---- Preset catalog (public) ----

test('GET /api/themes is public and lists every seeded preset', async () => {
  const client = newClient(baseUrl);
  const response = await client.get('/api/themes');

  assert.equal(response.status, 200);
  const { presets } = response.body.data;
  assert.equal(presets.length, 9);

  const slugs = presets.map((p) => p.slug);
  assert.deepEqual(slugs, [
    'rose_garden',
    'soft_pink',
    'sage_garden',
    'lavender',
    'peach',
    'warm_coffee',
    'ocean',
    'midnight',
    'minimal',
  ]);

  const defaultCount = presets.filter((p) => p.isDefault).length;
  assert.equal(defaultCount, 1);
  assert.equal(presets[0].slug, 'rose_garden');
  assert.equal(presets[0].isDefault, true);

  for (const preset of presets) {
    assert.equal(typeof preset.name, 'string');
    assert.ok(['LIGHT', 'DARK', 'BOTH'].includes(preset.mode));
    assert.equal(typeof preset.tokens, 'object');
    if (preset.mode === 'DARK') {
      assert.deepEqual(Object.keys(preset.tokens), ['dark']);
    } else {
      assert.ok(preset.tokens.light['--color-primary'].startsWith('#'));
      assert.ok(preset.tokens.dark['--color-primary'].startsWith('#'));
    }
  }
});

// ---- Authentication ----

test('GET /api/themes/me requires a session', async () => {
  const client = newClient(baseUrl);
  const response = await client.get('/api/themes/me');
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('PATCH /api/themes/me rejects a missing CSRF token', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'csrf-theme' });
  const response = await client.patch('/api/themes/me', { density: 'COMPACT' }, { csrf: false });
  assert.equal(response.status, 403);
});

// ---- Defaults ----

test('a fresh user gets default appearance preferences', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'theme-defaults' });

  const response = await client.get('/api/themes/me');
  assert.equal(response.status, 200);
  const data = response.body.data;

  assert.equal(data.colorMode, 'SYSTEM');
  assert.equal(data.density, 'COMFORTABLE');
  assert.equal(data.navStyle, 'SIDEBAR');
  assert.equal(data.themeSlug, 'rose_garden');
  assert.equal(data.overrides, null);
  assert.equal(data.theme.slug, 'rose_garden');
  assert.equal(data.theme.mode, 'BOTH');
  assert.ok(data.theme.tokens.light['--color-primary']);
  assert.ok(data.theme.tokens.dark['--color-primary']);
});

// ---- Preset selection ----

test('selecting a preset persists across requests', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'theme-select' });

  const patch = await client.patch('/api/themes/me', { themeSlug: 'ocean' });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.data.themeSlug, 'ocean');
  assert.equal(patch.body.data.theme.name, 'Ocean');

  const again = await client.get('/api/themes/me');
  assert.equal(again.body.data.themeSlug, 'ocean');
  assert.equal(again.body.data.theme.slug, 'ocean');

  const dark = await client.patch('/api/themes/me', { themeSlug: 'midnight' });
  assert.equal(dark.status, 200);
  assert.equal(dark.body.data.theme.mode, 'DARK');
  assert.equal(dark.body.data.theme.tokens.light, undefined);
  assert.ok(dark.body.data.theme.tokens.dark);
});

test('themeSlug: null falls back to the default preset', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'theme-fallback' });

  await client.patch('/api/themes/me', { themeSlug: 'sage_garden' });
  const response = await client.patch('/api/themes/me', { themeSlug: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.themeSlug, 'rose_garden');
});

test('an unknown preset slug is rejected with a field error', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'theme-unknown-slug' });

  const response = await client.patch('/api/themes/me', { themeSlug: 'does_not_exist' });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  const detail = response.body.error.details.find((d) => d.field === 'themeSlug');
  assert.ok(detail, JSON.stringify(response.body.error.details));
});

// ---- Overrides ----

test('valid color and radius overrides are normalized and persisted', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'theme-overrides' });

  const response = await client.patch('/api/themes/me', {
    overrides: {
      '--color-primary': '#AA4D72',
      '--color-surface': '#abc',
      '--radius-card': 14,
      '--radius-control': '10px',
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.overrides, {
    '--color-primary': '#aa4d72',
    '--color-surface': '#abc',
    '--radius-card': '14px',
    '--radius-control': '10px',
  });

  const again = await client.get('/api/themes/me');
  assert.deepEqual(again.body.data.overrides, response.body.data.overrides);
});

test('overriding a variable outside the allowlist is rejected', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'theme-bad-key' });

  const response = await client.patch('/api/themes/me', {
    overrides: { '--color-primary': '#112233', 'background-image': 'url(evil)' },
  });
  assert.equal(response.status, 400);
  const detail = response.body.error.details.find(
    (d) => d.field === 'overrides.background-image',
  );
  assert.ok(detail, JSON.stringify(response.body.error.details));
});

test('non-hex override values are rejected (no CSS injection)', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'theme-bad-color' });

  const response = await client.patch('/api/themes/me', {
    overrides: { '--color-primary': 'red; background: url(evil)' },
  });
  assert.equal(response.status, 400);
  const detail = response.body.error.details.find(
    (d) => d.field === 'overrides.--color-primary',
  );
  assert.ok(detail, JSON.stringify(response.body.error.details));
});

test('out-of-range radius overrides are rejected', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'theme-bad-radius' });

  const response = await client.patch('/api/themes/me', {
    overrides: { '--radius-card': 99 },
  });
  assert.equal(response.status, 400);
  const detail = response.body.error.details.find((d) => d.field === 'overrides.--radius-card');
  assert.ok(detail, JSON.stringify(response.body.error.details));
});

test('overrides: null clears stored overrides', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'theme-clear' });

  await client.patch('/api/themes/me', { overrides: { '--color-primary': '#123456' } });
  const cleared = await client.patch('/api/themes/me', { overrides: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.overrides, null);
});

// ---- Enums / unknown fields ----

test('invalid enum values and unknown fields are rejected', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'theme-enums' });

  const badMode = await client.patch('/api/themes/me', { colorMode: 'neon' });
  assert.equal(badMode.status, 400);
  assert.ok(badMode.body.error.details.some((d) => d.field === 'colorMode'));

  const badDensity = await client.patch('/api/themes/me', { density: 'SPACIOUS' });
  assert.equal(badDensity.status, 400);

  const badNav = await client.patch('/api/themes/me', { navStyle: 'RAIL' });
  assert.equal(badNav.status, 400);

  const unknown = await client.patch('/api/themes/me', { fontSize: 16 });
  assert.equal(unknown.status, 400);
  assert.ok(unknown.body.error.details.some((d) => d.field === 'fontSize'));
});

test('valid enum updates persist', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'theme-enums-ok' });

  const response = await client.patch('/api/themes/me', {
    colorMode: 'dark',
    density: 'compact',
    navStyle: 'bottom',
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.colorMode, 'DARK');
  assert.equal(response.body.data.density, 'COMPACT');
  assert.equal(response.body.data.navStyle, 'BOTTOM');

  const again = await client.get('/api/themes/me');
  assert.equal(again.body.data.colorMode, 'DARK');
  assert.equal(again.body.data.density, 'COMPACT');
  assert.equal(again.body.data.navStyle, 'BOTTOM');
});

test('an empty PATCH body returns current state without changes', async () => {
  const client = newClient(baseUrl);
  const { email } = await registerUser(client, { domain: DOMAIN, label: 'theme-empty' });

  const response = await client.patch('/api/themes/me', {});
  assert.equal(response.status, 200);
  assert.equal(response.body.data.themeSlug, 'rose_garden');

  const preferences = await prisma.userPreference.count({ where: { user: { email } } });
  assert.equal(preferences, 0);
});

// ---- Reset ----

test('DELETE /api/themes/me resets appearance preferences', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'theme-reset' });

  await client.patch('/api/themes/me', {
    themeSlug: 'lavender',
    colorMode: 'LIGHT',
    density: 'COMPACT',
    navStyle: 'BOTTOM',
    overrides: { '--color-primary': '#123456' },
  });

  const reset = await client.del('/api/themes/me');
  assert.equal(reset.status, 200);
  assert.equal(reset.body.data.themeSlug, 'rose_garden');
  assert.equal(reset.body.data.colorMode, 'SYSTEM');
  assert.equal(reset.body.data.density, 'COMFORTABLE');
  assert.equal(reset.body.data.navStyle, 'SIDEBAR');
  assert.equal(reset.body.data.overrides, null);

  const again = await client.get('/api/themes/me');
  assert.equal(again.body.data.themeSlug, 'rose_garden');
});

test('DELETE /api/themes/me is idempotent for a fresh user', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'theme-reset-idem' });

  const response = await client.del('/api/themes/me');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.themeSlug, 'rose_garden');
});

// ---- Isolation ----

test('appearance preferences are isolated per user', async () => {
  const userA = await createUser('iso-a');
  const userB = await createUser('iso-b');

  await userA.client.patch('/api/themes/me', {
    themeSlug: 'ocean',
    density: 'COMPACT',
    overrides: { '--color-primary': '#2f6f8f' },
  });

  const a = await userA.client.get('/api/themes/me');
  assert.equal(a.body.data.themeSlug, 'ocean');
  assert.equal(a.body.data.density, 'COMPACT');

  const b = await userB.client.get('/api/themes/me');
  assert.equal(b.body.data.themeSlug, 'rose_garden');
  assert.equal(b.body.data.density, 'COMFORTABLE');
  assert.equal(b.body.data.overrides, null);

  assert.notEqual(userA.email, userB.email);
});

// ---- Accessibility: WCAG AA contrast over stored presets ----

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

test('every stored preset meets WCAG AA contrast in every mode', async () => {
  const themes = await prisma.theme.findMany({ orderBy: { sortOrder: 'asc' } });
  assert.equal(themes.length, 9);

  const failures = [];
  for (const theme of themes) {
    for (const [mode, tokens] of Object.entries(theme.tokens)) {
      const surfaces = ['--color-background', '--color-surface', '--color-surface-alt'];
      for (const surface of surfaces) {
        for (const key of ['--color-text', '--color-text-muted', '--color-primary']) {
          const ratio = contrast(tokens[key], tokens[surface]);
          if (ratio < 4.5) {
            failures.push(`${theme.slug}/${mode} ${key} on ${surface}: ${ratio.toFixed(2)}`);
          }
        }
      }
      for (const key of ['--color-success', '--color-warning', '--color-danger', '--color-info']) {
        const onSurface = contrast(tokens[key], tokens['--color-surface']);
        if (onSurface < 4.5) {
          failures.push(`${theme.slug}/${mode} ${key} on surface: ${onSurface.toFixed(2)}`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});
