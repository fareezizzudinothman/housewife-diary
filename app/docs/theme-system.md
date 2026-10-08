# Theme system and UI design system (Phase 3 — implemented)

Status: **implemented and tested**. Everything below describes the code in this repository: the CSS variable contract, the nine seeded presets, per-user persistence (routes → controllers → services → repositories), the client-side theme runtime, the app shell and the reusable component set.

## Principles

- All colors, radii, shadows, spacing and type sizes are CSS variables — components never hardcode them.
- Themes are data, not stylesheets: presets are rows in the `themes` table (JSON token sets); user preferences live in `user_preferences`.
- First paint is already themed: `js/theme/boot.js` (a plain blocking script allowed by the CSP) restores the cached theme before the page renders, so there is no flash of the default palette.
- The client never guesses colors: it applies the server's token sets as inline custom properties on `<html>` and derives soft/strong variants with `color-mix()`.
- Every preset pair (light and dark) is verified against WCAG AA contrast — see [Accessibility](#accessibility).

## Variable contract (`src/client/css/tokens.css`)

```css
:root {
  /* color (overridden per theme) */
  --color-primary;    --color-secondary;    --color-accent;
  --color-background; --color-surface;      --color-surface-alt;
  --color-text;       --color-text-muted;   --color-border;
  --color-success;    --color-warning;      --color-danger;   --color-info;
  /* derived (color-mix — never stored) */
  --color-primary-soft;  --color-primary-strong;   /* …and every other color */
  --color-on-primary;    --color-on-danger;        /* computed by luminance */
  /* shape, elevation, type, motion, layout */
  --radius-card; --radius-control; --radius-pill;
  --shadow-card; --shadow-pop; --shadow-modal;
  --font-family-base; --font-family-display;
  --text-xs … --text-2xl; --space-1 … --space-8; --gap-stack;
  --header-height; --sidebar-width; --bottomnav-height; --tap-min;
  --transition-fast; --transition-base;
  /* dashboard slots */
  --chart-1 … --chart-6;
}
```

Density (`data-density='compact'`) and navigation (`data-nav-style='bottom'`) adjust spacing/font tokens; they are layout preferences, not part of a preset.

## Presets

Nine seeded rows in `themes` (id = slug, ordered by `sort_order`, `rose_garden` is the default):

| Slug | Name | Mood | Mode |
| --- | --- | --- | --- |
| `rose_garden` | Rose Garden | Warm, classic and romantic — roses on cream. | BOTH (default) |
| `soft_pink` | Soft Pink | Gentle, light and airy — blush on white. | BOTH |
| `sage_garden` | Sage Garden | Calm, natural and grounded — sage on warm ivory. | BOTH |
| `lavender` | Lavender | Soft, airy and dreamy — lavender on pale lilac. | BOTH |
| `peach` | Peach | Cozy, sunny and inviting — peach on cream. | BOTH |
| `warm_coffee` | Warm Coffee | Rich, grounded and toasty — coffee on latte. | BOTH |
| `ocean` | Ocean | Fresh, clear and breezy — teal on seafoam. | BOTH |
| `midnight` | Midnight | Dark, elegant and quiet — slate blue on deep navy. | DARK (locked) |
| `minimal` | Minimal | Clean, quiet and modern — charcoal on white. | BOTH |

`themes.tokens` is JSON: `{"light": {…tokens}, "dark": {…tokens}}`. A `DARK`-mode preset locks the UI to dark regardless of the user's color-mode preference.

## Database

Migration `20261007052226_theme_preferences`:

- `themes` — `id` (text, = slug), `slug` (unique), `name`, `mood`, `mode` (`theme_mode` enum), `is_default`, `sort_order`, `tokens` (JSONB). Seeded with the nine presets.
- `user_preferences` — one row per user (lazy upsert): `theme_id` (FK → `themes`, `SET NULL`), `theme_overrides` (JSONB), `color_mode` (`LIGHT|DARK|SYSTEM`), `density` (`COMPACT|COMFORTABLE`), `nav_style` (`SIDEBAR|BOTTOM`).

## API

| Method / path | Auth | Behaviour |
| --- | --- | --- |
| `GET /api/themes` | public | `{ presets: [{ slug, name, mood, mode, isDefault, sortOrder, tokens }] }` — lets unthemed pages render the catalog |
| `GET /api/themes/me` | session | Resolved appearance: `{ colorMode, density, navStyle, themeSlug, overrides, theme: { slug, name, mode, tokens } }` |
| `PATCH /api/themes/me` | session + CSRF | Partial update (`colorMode`, `density`, `navStyle`, `themeSlug`, `overrides`); returns the full resolved state. An empty body returns state without writing |
| `DELETE /api/themes/me` | session + CSRF | Reset to defaults; idempotent |

Validation (in `validators/themeValidators.js`):

- `overrides` is an **allowlist** of nine colors plus `--radius-card`/`--radius-control` (11 keys maximum) — anything else is a `400 VALIDATION_ERROR`. Values must be hex (`#rgb`/`#rrggbb`, normalized to lowercase) or an integer radius 0–40 (normalized to `18px`-style strings). This makes override injection of `var()`, `url()` etc. impossible.
- Enums are uppercased and checked; unknown top-level fields are rejected; an unknown `themeSlug` returns a field error.
- Unauthenticated `GET /api/themes/me` returns `401` — the client falls back to the public catalog.

## Runtime application (client)

1. **`js/theme/boot.js`** — blocking script in `<head>` (external file, because the CSP has `script-src 'self'`). Reads `localStorage['hd.theme.v1']`, sets `data-color-mode` / `data-density` / `data-nav-style` / `data-sidebar` / `data-theme` on `<html>` and applies the cached inline variables + `--color-on-primary`/`--color-on-danger` before first paint.
2. **`js/theme/engine.js`** — single source of truth. `initTheme()` seeds from the cache, then fetches `GET /api/themes/me` (on `401` it loads the public catalog) and applies tokens for the effective mode (system preference via `matchMedia`, listened to for live changes). Mutations (`setColorMode`, `setDensity`, `setNavStyle`, `setPreset`, `setOverrides`, `resetAppearance`, `setSidebar`) apply optimistically, `PATCH`/`DELETE` in the background and re-adopt the server's resolved state; on failure they recover from the server and rethrow so the UI can toast. Every change rewrites the localStorage cache (so `boot.js` stays correct) and notifies subscribers (`onThemeChange`).
3. **Components** consume only variables — switching theme, mode, density or navigation never touches component code.

`--color-on-primary` / `--color-on-danger` are computed from WCAG luminance (better of `#ffffff` / `#191416`) so buttons stay ≥ 4.5:1 on any user-chosen color.

## Layout and pages

- **App shell** (`layout.css` + `js/shell.js`): sticky topbar (brand, page title, sidebar/theme/account controls), sidebar rail, main content, floating bottom nav. Pages provide `[data-shell="topbar|sidebar|bottomnav"]` placeholders and call `initShell()`; the shell wires the color-mode toggle (SYSTEM → LIGHT → DARK), sidebar collapse (local-only), account dropdown and current-page marking (`aria-current`).
- **Bottom navigation** appears automatically at ≤ 1024 px or when `data-nav-style='bottom'`.
- **Auth pages** use the split `.auth-shell` (decorative aside + card), **the landing page** uses `.landing`.
- **Pages:** landing (`/`), login, register, forgot/reset password, profile, household, **appearance** (preset grid, color-mode/density/navigation segmented controls, per-color override pickers, radius sliders, reset with confirmation), **dashboard** (real `/api/dashboard` data: greeting, stat tiles, diary summary, household facts, coming-soon module grid) and **diary** (timeline with date/slot groups, entry detail with private photo attachments, create/edit form).

## Reusable components (`src/client/css/components.css` + `js/components/`)

- CSS: cards, buttons (primary/secondary/ghost/danger/link), form fields + status, status pills, badges, alerts, item lists, tables, segmented control, dropdown menu, avatar, modal, toasts, icon buttons, spinner, loading/empty/error states, preset grid, color field, stat tiles, chart, progress, timeline, key-value rows.
- JS: `icon` (SVG sprite `icons/sprite.svg` — no emoji, no icon font), `toast`, `modal` (+ `confirmDialog`), `dropdown`, `segmented`, `states` (HTML-string loading/empty/error blocks).

File order in every page: `tokens.css → themes.css → base.css → layout.css → components.css → responsive.css`, then `<script src="/js/theme/boot.js"></script>` in `<head>` and the page module at the end of `<body>`.

## Accessibility

- Text on `--color-background`/`--color-surface`/`--color-surface-alt` ≥ 4.5:1; semantic colors ≥ 4.5:1 on surfaces and ≥ 3:1 on the background; soft-badge/secondary-button text uses the `-strong` variant (≥ 4.5:1); borders ≥ 1.3:1 against surfaces.
- Every preset is checked by `tests/themes.test.js` ("every stored preset meets WCAG AA contrast in every mode") against the tokens stored in the database — a failing preset fails the suite.
- Focus is always visible (`:focus-visible` outline), icon-only buttons carry `aria-label`s, segmented controls expose `aria-pressed`, the modal is a labelled dialog with keyboard dismissal, toasts/statuses are live regions, and the bottom-nav/topbar patterns meet the 44 px touch target on coarse pointers.
