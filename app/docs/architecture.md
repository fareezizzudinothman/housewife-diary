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

## Dashboard and diary (Phase 4)

- **Dashboard** is a read-only aggregation: `GET /api/dashboard` composes the user, household and diary summary and marks every not-yet-built module `not_available` — the client never fakes data (the Phase 3 mock preview was deleted).
- **Diary** is the first complete feature module and the template for later modules: `diaryValidators` → `diaryRepository` → `diaryService` → `diaryController` → `diary.routes`, mounted under `/api/diary`. Every query is scoped to `{householdId, userId}` so entries are private to their author inside a household.
- **Attachments** are stored as files under `app/uploads/diary/` (Docker volume) with metadata rows in `diary_attachments`. Uploads arrive as raw binary bodies (no multipart dependency), are sniffed by magic bytes, and are only ever served back through authenticated streaming endpoints — never as static files. Full design: [diary.md](diary.md).
- **Client pages** (`dashboard`, `diary`, `diary-entry`, `diary-form`) are plain HTML + page controllers under `js/pages/`, using the shared shell, components and `js/api` transport.

## Kitchen flow (Phase 6)

Recipes, meals, shopping and inventory form one connected flow, each module still following the standard layering (`validators → repositories → services → controllers → routes`):

```text
Recipe (structured ingredients)
   │  attach to a planned meal
   ▼
Meal plan entry ──► calendar (derived, all-day sourceType: MEAL items)
   │  preview aggregation            │  add with serving scaling
   ▼                                 ▼
Shopping list items ◄────────────────┘
   │  explicit per-item action (records a PURCHASE transaction)
   ▼
Inventory item + quantity ledger (derived stock/expiry status → dashboard alerts)
```

- **Shared kitchen vocabulary** (`validators/kitchen.js`): meal types, item categories, inventory locations, units and `Decimal(12,3)` quantity parsing/normalization exist in exactly one place.
- **Matching key:** every ingredient/line/item stores a normalized (lowercased, whitespace-collapsed) name; recipe → shopping and shopping → inventory merge only on equal normalized name **and** unit (case-insensitive). Units are never converted.
- **Derived, never stored:** calendar `MEAL` items, meal `displayTitle`, shopping merge results, inventory stock/expiry statuses and dashboard alerts are computed per request.
- **Ledger discipline:** inventory quantity changes only through transaction endpoints (`PURCHASE`/`CONSUME`/`WASTE`/`ADJUST`); a direct `PATCH` of `quantity` is rejected, so every balance is reconstructible from `inventory_transactions.quantity_after`.
- **Cross-module ownership:** all four modules are household-scoped from the session; recipe/meal ids from another household resolve to `404` and can never be referenced into a list.
- Full designs: [recipes.md](recipes.md), [meals.md](meals.md), [shopping.md](shopping.md), [inventory.md](inventory.md).

## Finance ledger (Phase 7)

Finance is a ledger-oriented module layered on the same rules (`validators → repositories → services → controllers → routes`, mounted at `/api/finance`):

```text
Accounts (one currency each)        Categories (global seeds + household)
        │                                   │
        └──────────► financial_transactions ◄────── sourceType: BILL / RECURRING
                     (single shared ledger:          ▲            ▲
                      EXPENSE · INCOME · TRANSFER)   │            │
                        │                    payBillAtomically   bounded
                        ▼                             (atomic)    materialization
              derived balances · budgets · bills · recurring rules · receipts · reports
```

- **One table for money movement:** `financial_transactions` holds income, expenses and transfers as positive magnitudes with a `type`; direction, not sign, carries meaning. Transfers require equal-currency accounts and are excluded from income/expense totals.
- **Decimal everywhere:** `Decimal(14,2)` columns, Prisma `Decimal` arithmetic (`utils/money.js`), two-decimal strings over the wire — JavaScript floats never touch an amount.
- **Derived, never stored:** account balances (`opening + income − expense ± transfers`), bill `DUE`/`OVERDUE` status, budget spend/percent, report and dashboard aggregates (PostgreSQL `groupBy` sums).
- **Atomic compound writes** live in repository transactions: `payBillAtomically` (bill + linked expense + unique payment guard) and `voidTransactionAtomically` (void + bill reopen). Services never patch across two money tables.
- **Bounded recurrence** reuses the shared engine (`utils/recurrence.js`, same as Tasks/Calendar): structured `DAILY|WEEKLY|MONTHLY|YEARLY` rules materialize ledger rows only up to today, ≤ 60 per run, with a unique `(recurringTransactionId, transactionDate)` guard — no unbounded row generation.
- **Calendar integration** follows the existing source abstraction: unpaid bills become derived read-only `sourceType: BILL` items — no new calendar tables, no persisted duplicates. Dashboard finance is real aggregation; the `not_available` flag for finance was removed.
- Full design: [finance.md](finance.md), [finance-transactions.md](finance-transactions.md), [finance-budgets.md](finance-budgets.md), [finance-bills.md](finance-bills.md), [finance-reports.md](finance-reports.md).

## AI assistant (Phase 10)

The assistant never receives database access. It sits above a tool layer of allow-listed, household-scoped functions (`getTasks`, `createMeal`, `analyseExpenses`, …) that call the same application services used by the REST API, so authentication and household isolation apply automatically. See [ai-architecture.md](ai-architecture.md).

## Family + Home + Documents + Notes + Ideas (Phase 8)

Phase 8 adds household management modules following the same layered architecture:

```
src/server/
  controllers/
    familyController.js      # family members + events
    homeController.js        # rooms, cleaning, laundry, maintenance
    documentsController.js   # secure uploads, private serving
    notesController.js       # CRUD, tags, pin, archive
    ideasController.js       # CRUD, optional task link
  repositories/
    familyRepository.js
    homeRepository.js
    documentsRepository.js
    notesRepository.js
    ideasRepository.js
  services/
    familyService.js
    homeService.js
    documentsService.js
    notesService.js
    ideasService.js
  validators/
    familyValidators.js
    homeValidators.js
    documentsValidators.js
    notesValidators.js
    ideasValidators.js
  routes/
    family.routes.js
    home.routes.js
    documents.routes.js
    notes.routes.js
    ideas.routes.js
```

### Calendar & Task Integrations

| Source | Calendar (read-only derived) | Task generation |
|--------|------------------------------|-----------------|
| Family events (birthdays, anniversaries) | `sourceType: FAMILY`, all-day, yearly if repeating | — |
| Family member birthdays | `sourceType: FAMILY`, all-day, yearly | — |
| Maintenance (scheduled date) | `sourceType: MAINTENANCE`, all-day | `POST /api/home/maintenance/:id/task` |
| Ideas | — | `POST /api/ideas/:id/task` |

These follow the existing source abstraction established in Phases 5-7 — no new calendar or task tables, just derived read-only items and atomic task creation endpoints.

### Dashboard Integration

`dashboardService.getDashboard()` now includes:
- `family`: member count, upcoming birthdays
- `home`: overdue maintenance, upcoming maintenance, due cleaning, laundry status, expiring documents
- Modules marked `available` when household has at least one record

### Documents Security

- Raw binary uploads (same pattern as Diary attachments)
- Magic-byte MIME verification (JPEG, PNG, WebP, PDF only)
- 5 MB max, private streaming endpoint (`/api/documents/:id/file`)
- Expiry status computed on read (ACTIVE, EXPIRING_SOON, EXPIRED)
- Cross-references: MAINTENANCE, FINANCE_TRANSACTION, INVENTORY, FAMILY_MEMBER

### Notes vs Diary

Notes are topic-based reference (tags, pin, archive, search). Diary is date-based personal journal (attachments, mood). Separate tables, separate APIs, no overlap.

### Ideas vs Tasks

Ideas capture lightweight wishes with optional cost estimate. One-way link to generate a Task (`POST /api/ideas/:id/task`). Ideas never become tasks automatically.

## Key architectural decisions

| Decision | Rationale |
| --- | --- |
| Express on Node.js, JavaScript (ES modules) | Mandated stack; mature, minimal, testable |
| PostgreSQL + Prisma with migrations | Mandated stack; migrations-only workflow, parameterized queries by default |
| Same-origin static client served by the API | One service, no CORS complexity, simple Docker story |
| Server-side sessions with HTTP-only cookies (Phase 2) | Secure logout/revocation, remember-me, CSRF control — see [authentication.md](authentication.md) |
| Raw binary uploads with magic-byte sniffing (Phase 4) | Avoids a multipart dependency; type is decided by content, not the client; stored names are server-generated — see [diary.md](diary.md) |
| Empty Prisma schema at foundation | Business tables land with their phase; no premature schema complexity |
| Two environment files (root `.env` for Compose, `app/.env` for local dev) | Compose interpolates the root file; the app container receives `DATABASE_URL` built from it; local dev keeps an isolated file |
| Non-root Docker container + healthchecks | Production posture from day one |
| App on host port 3200, PostgreSQL on 5434 (defaults) | `3000`/`5432` are occupied by other projects on this machine; both are overridable |

## Technology constraints (non-negotiable)

- No React/Vue/Angular/Svelte/Next/Nuxt, no Tailwind — the client stays framework-free and understandable.
- No unrestricted raw SQL in services; repositories own data access through Prisma.
- No secret values in source control; configuration comes from the environment and fails fast when incomplete.
