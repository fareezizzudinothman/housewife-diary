# Architecture

Housewife Diary is a single-product web application: a Node.js REST API backed by PostgreSQL (via Prisma), serving a framework-free HTML/CSS/vanilla-JS client from the same origin. This document is the architectural source of truth — implementation follows it phase by phase.

## System overview

```text
┌────────────────────────────────────────────────────┐
│ Browser                                            │
│  src/client — HTML5 · CSS3 (theme variables)       │
│  vanilla JavaScript ES modules                     │
│  pages/ components/ services/ state/ api/ utils/    │
└───────────────────────┬────────────────────────────┘
                        │  same-origin REST (JSON) — /api/*
┌───────────────────────▼────────────────────────────┐
│ Node.js application — src/server                    │
│  middleware: security · auth · validation · errors │
│  routes → controllers → services                   │
│                  └→ repositories → Prisma Client   │
└───────────────────────┬────────────────────────────┘
                        │  parameterized SQL via Prisma
┌───────────────────────▼────────────────────────────┐
│ PostgreSQL — household-isolated relational data   │
└────────────────────────────────────────────────────┘
```

## Backend layering

Each layer has a single responsibility and a single direction of dependency:

| Layer | Directory | Responsibility |
| --- | --- | --- |
| Routes | `src/server/routes` | Map HTTP methods/paths to controllers; mount per module under `/api` |
| Controllers | `src/server/controllers` | Translate HTTP ⇄ service calls; use `sendSuccess`/`sendError`; never contain business logic |
| Services | `src/server/services` | Business logic, authorization decisions, transactions |
| Repositories | `src/server/repositories` | The only layer that touches Prisma models (introduced with Phase 2) |
| Validators | `src/server/validators` | Request input validation schemas/rules per module |
| Middleware | `src/server/middleware` | Cross-cutting: error handling, cookies, CSRF, authentication, authorization, rate limiting |
| Config | `src/server/config` | Environment loading and validation (fail fast at startup) |
| Shared | `src/shared` | Contracts shared across server and client (API error codes, envelope types) |

Request lifecycle: `helmet` → `express.json` → module router → controller → service → repository → Prisma → PostgreSQL. Errors are never caught ad hoc: controllers forward failures to `next(error)` and the central error handler converts them into the standard error envelope.

## Household model

The application is household-scoped, not single-user:

```text
User ──< household_members >── Household
             (role: OWNER | ADMIN | MEMBER | VIEWER)
```

- Every household-scoped table carries `household_id` (FK + index).
- All queries filter by the household derived from the authenticated session; services never trust a client-supplied `household_id`.
- Roles govern capabilities (e.g. only OWNER/ADMIN manage members; VIEWER is read-only).
- Household data is isolated at the service/repository boundary — one household can never read another's rows.

## Frontend architecture

- **No framework, no build step:** HTML5 pages (`src/client/pages/`) styled by a fixed CSS file order driven by theme variables (`tokens.css` → `themes.css` → `base.css` → `layout.css` → `components.css` → `responsive.css`).
- **ES modules:** `js/api` (transport), `js/services` (feature logic), `js/theme` (theme boot + engine), `js/components` (reusable DOM components), `js/pages` (page controllers), `js/state` (client state), `js/utils` (helpers), `js/shell.js` (shared app chrome).
- **Separation of concerns:** UI code never calls `fetch` directly; it goes through `js/api`, which understands the standard response envelope.
- **Responsive:** mobile-first CSS; the app shell switches from sidebar to bottom navigation at 1024 px (or on demand via the navigation preference).

## Theme engine (Phase 3)

Themes are pure CSS variable sets applied via `data-*` attributes on `<html>` plus per-user inline overrides (colors, radius, density, navigation style). Presets are rows in the `themes` table, preferences are stored per user in `user_preferences`, and a blocking boot script restores the cached theme before first paint. The full contract — variables, presets, API and runtime — is specified in [theme-system.md](theme-system.md).

## AI assistant (Phase 10)

The assistant never receives database access. It sits above a tool layer of allow-listed, household-scoped functions (`getTasks`, `createMeal`, `analyseExpenses`, …) that call the same application services used by the REST API, so authentication and household isolation apply automatically. See [ai-architecture.md](ai-architecture.md).

## Key architectural decisions

| Decision | Rationale |
| --- | --- |
| Express on Node.js, JavaScript (ES modules) | Mandated stack; mature, minimal, testable |
| PostgreSQL + Prisma with migrations | Mandated stack; migrations-only workflow, parameterized queries by default |
| Same-origin static client served by the API | One service, no CORS complexity, simple Docker story |
| Server-side sessions with HTTP-only cookies (Phase 2) | Secure logout/revocation, remember-me, CSRF control — see [authentication.md](authentication.md) |
| Empty Prisma schema at foundation | Business tables land with their phase; no premature schema complexity |
| Two environment files (root `.env` for Compose, `app/.env` for local dev) | Compose interpolates the root file; the app container receives `DATABASE_URL` built from it; local dev keeps an isolated file |
| Non-root Docker container + healthchecks | Production posture from day one |
| App on host port 3200, PostgreSQL on 5434 (defaults) | `3000`/`5432` are occupied by other projects on this machine; both are overridable |

## Technology constraints (non-negotiable)

- No React/Vue/Angular/Svelte/Next/Nuxt, no Tailwind — the client stays framework-free and understandable.
- No unrestricted raw SQL in services; repositories own data access through Prisma.
- No secret values in source control; configuration comes from the environment and fails fast when incomplete.
