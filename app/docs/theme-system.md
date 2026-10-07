# Theme system (Phase 3 — planned, not yet implemented)

Status: **design specification**. The CSS variable contract below is partially in place (`src/client/css/themes.css` ships the default palette); presets, persistence and customization UI arrive in Phase 3.

## Principles

- All colors, radii, shadows and typography sizes are expressed as CSS variables — components never hardcode them.
- Themes are data, not stylesheets: presets are rows in a `themes` table; user customizations are JSON in `user_preferences`.
- The server renders the active theme (inline `:root` variable overrides + `data-theme` attribute) so the first paint is already themed — no flash of default theme.
- Accessibility: every preset must meet WCAG AA contrast for body text; presets are validated before being added.

## Variable contract

```css
:root {
  --color-primary;        --color-secondary;      --color-accent;
  --color-background;     --color-surface;        --color-text;
  --color-text-muted;     --color-border;
  --color-primary-soft;
  --color-success;        --color-success-soft;
  --color-warning;        --color-warning-soft;
  --color-danger;         --color-danger-soft;
  --radius-card;           --radius-control;      --radius-pill;
  --shadow-card;
  --font-family-base;
}
```

Phase 3 adds: navigation style tokens (sidebar vs bottom-nav), density tokens (compact/comfortable paddings and font scale), and chart/status palette slots used by the dashboard.

## Presets (planned)

| Preset | Mood | Primary / Background sketch |
| --- | --- | --- |
| Rose Garden (default) | warm, classic | rose `#b5537a` on cream `#faf6f1` |
| Soft Pink | gentle, light | blush pink on white |
| Sage Garden | calm, natural | sage green on warm ivory |
| Lavender | soft, airy | lavender on pale lilac |
| Peach | cozy, sunny | peach on cream |
| Warm Coffee | rich, grounded | coffee brown on latte |
| Ocean | fresh, clear | teal-blue on seafoam |
| Midnight | dark, elegant | slate-blue on deep navy (dark mode) |
| Minimal | clean, quiet | charcoal on white, minimal accent |

## User customization

Users may override, per variable, from Settings → Appearance:

- primary, secondary, accent, background, surface (card), text colors;
- border radius (`--radius-card`, `--radius-control`);
- navigation style (sidebar / bottom navigation);
- dashboard density (compact / comfortable).

Storage: `user_preferences.theme_id` (preset) + `user_preferences.theme_overrides` (JSON of variable → value). A "reset to preset" action clears overrides.

## Runtime application

1. Unauthenticated/first paint: default preset variables from `themes.css`.
2. After login, the server injects the resolved variable set (preset + overrides) into the page as inline `:root` style.
3. Changes via `PATCH /api/themes` persist immediately and re-render the shell without reload.
4. The client never guesses colors — components only consume variables.
