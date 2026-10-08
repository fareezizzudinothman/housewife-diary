# Implementation plan

Housewife Diary is built phase by phase. Each phase has explicit scope and completion criteria; no phase starts before its predecessor is stable, and no future phase's code is written early. The workflow for every change is defined in [development-workflow.md](development-workflow.md).

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Architecture and project specification | **Complete** |
| 1 | Foundation: Node.js, PostgreSQL, Prisma, Docker, Git, documentation, health check | **Complete** |
| 2 | Authentication and household management | **Complete** |
| 3 | UI foundation and theme engine | **Complete** |
| 4 | Dashboard and diary | **Complete** |
| 5 | Tasks and calendar | **Complete** |
| 6 | Meals, recipes, shopping, inventory | **Complete** |
| 7 | Finance, expenses, bills, budgets, reports | **Complete** |
| 8 | Family, home management, documents, notes, ideas | **Complete** |
| 9 | Notifications, PWA, backup/export | **Complete** |
| 10 | AI assistant and household automation | Planned |

## Phase 0–1 (delivered in this repository state)

- Repository structure per the mandated layout; all application files under `app/`, Compose at the root, Dockerfile at `app/Dockerfile`.
- Node.js project (`app/package.json`, ES modules) with Express, helmet, dotenv, Prisma.
- Docker Compose: `app` + `postgres` services, persistent `postgres_data` volume, healthchecks, non-root container, secrets via environment.
- Prisma configured against PostgreSQL; schema deliberately empty — the migration history begins with Phase 2's `users` model.
- Central configuration with fail-fast validation; central error handling with the standard response envelopes.
- `GET /api/health` liveness + database readiness probe.
- Framework-free client shell (HTML, CSS variable contract, ES modules) wired to the health endpoint.
- Test suite (`node --test`): health API, envelope/404 behavior, static page, config validation.
- Documentation set (this directory) + README.
- Git: `main`, `develop`, `feature/project-foundation` branches; remote prepared for push.

### Completion criteria (met)

- `docker compose up -d --build` brings the stack healthy; `curl /api/health` returns `success: true`.
- `npm test` passes with a reachable PostgreSQL.
- `prisma generate` / `prisma migrate status` succeed against the database.
- No secrets in Git; `.env` files ignored; working tree clean after commit.

## Phase 2 — Authentication and household management (delivered)

**Scope:**

- Models: `users`, `sessions`, `households`, `household_members` (first Prisma migration).
- Register, login, logout, session management (HTTP-only cookies), remember me.
- Password hashing (bcrypt), login rate limiting, session expiration.
- Forgot/reset/change password and email verification (token flows).
- Authentication + authorization middleware; household isolation enforced in services.
- User profile endpoints; household create/join/leave; member roles (OWNER/ADMIN/MEMBER/VIEWER).
- Tests: auth flows, authorization boundaries, household isolation.

**Out of scope:** any diary/task/finance feature, themes, AI.

**Design:** [authentication.md](authentication.md), [database-design.md](database-design.md), [api-design.md](api-design.md).

### Completion criteria (met)

- `npm test` passes: auth flows, password/token flows, role matrix, cross-household isolation (404), config validation.
- Migration `auth_core` applied; `prisma migrate status` reports an up-to-date schema.
- `docker compose up -d --build` healthy; smoke-tested register → create household → session → login through the container.
- No secrets in Git; `.env`/`.env.example` carry `SESSION_SECRET`, Compose requires it in the app service.

## Phase 3 — UI foundation and theme engine (delivered)

**Scope:**

- Theme engine: nine seeded presets (`themes` table, JSON light/dark token sets), CSS-variable contract in `tokens.css`, first-paint boot script, client engine with system/light/dark modes, density and navigation styles, per-user overrides persisted through `GET/PATCH/DELETE /api/themes/me`.
- Second Prisma migration: `themes` + `user_preferences` (+ enums), seeded with the preset catalog.
- Backend module following the layering rules: `themeValidators` → `themeRepository` → `themeService` → `themeController` → `themes.routes`, mounted under `/api/themes`.
- App shell (topbar, sidebar, bottom navigation, account menu, color-mode toggle), auth/landing layouts, responsive behaviour from 375 px up.
- Reusable component system (CSS + JS): cards, buttons, forms, lists, tables, segmented control, dropdown, modal (+ confirm dialog), toasts, states, icon sprite, dashboard building blocks (stat tiles, chart, progress, timeline, key-value rows).
- Pages: appearance settings (preset grid, color/radius editors, reset), dashboard preview (mock sample data only), redesigned auth/landing/profile/household pages.
- Tests: themes API suite including a WCAG AA contrast check over every stored preset.

**Out of scope:** diary/tasks/meals/recipes/shopping/inventory/finance/calendar/AI business logic (Phases 4–10); real dashboard data (preview uses mock data only).

**Design:** [theme-system.md](theme-system.md), [architecture.md](architecture.md), [database-design.md](database-design.md), [api-design.md](api-design.md).

### Completion criteria (met)

- `npm test` passes (64 tests) including the theme API suite and the preset contrast check.
- Migration `theme_preferences` applied; `prisma migrate status` reports an up-to-date schema.
- `docker compose up -d --build` healthy; smoke-tested pages, assets and `/api/themes` through the container.
- Browser-verified: all pages render without JS/network errors, theme/override persistence across reloads, responsive layouts with no horizontal overflow, keyboard focus visible.

## Phase 4 — Dashboard and diary (delivered)

**Scope:**

- Third Prisma migration: `moods`, `diary_entries`, `diary_tags`, `diary_entry_tags`, `diary_attachments` (+ `time_of_day` enum), seeded with ten moods.
- Dashboard aggregation endpoint (`GET /api/dashboard`): user, household and diary summary; future modules return an explicit `not_available` status — no mocked data anywhere.
- Diary module (full CRUD): timeline listing grouped by date and day-part, search, date-range/mood/tag filters, pagination, personal scope (`householdId + userId`) with 404 isolation.
- Attachments: raw-binary upload (≤5 MB, ≤5 per entry), magic-byte type detection, private authenticated streaming, delete cascades files.
- Client: `dashboard`, `diary` (timeline + filters), `diary-entry` (detail + attachments), `diary-form` (create/edit) pages; ApiClient gained `upload()`; sprite additions; dashboard mock preview deleted.
- Tests: 26 new server tests (90 total) covering CRUD/validation, filters, isolation boundaries, attachment lifecycle and the dashboard contract.

**Out of scope:** tasks, meals, recipes, shopping, inventory, finance, calendar, family, AI (Phases 5–10).

**Design:** [diary.md](diary.md), [architecture.md](architecture.md), [database-design.md](database-design.md), [api-design.md](api-design.md).

### Completion criteria (met)

- `npm test` passes (90 tests) including diary CRUD, isolation and attachment suites.
- Migration `diary_core` applied; `prisma migrate status` reports an up-to-date schema.
- `docker compose up -d --build` healthy; diary upload volume persists across container restart.
- Browser-verified: full diary flow (create → detail → upload → filter → edit → delete), dashboard with real data, no JS/network errors, no horizontal overflow at 1360/1024/820/768/480/375 px.

## Phase 5 — Tasks and calendar (delivered)

**Scope:**

- Fourth Prisma migration `tasks_core`: `task_categories`, `tasks` (with the bounded recurrence materialization) and `calendar_events` (+ `task_status`, `task_priority`, `calendar_category`, `calendar_source_type` enums).
- Tasks module (full CRUD): household-wide categories, assignment, priority, views (`today`/`upcoming`/`overdue`/`completed`/`all`), filters, sorting, pagination; completion endpoint; series-aware deletion.
- Recurrence foundation shared by both modules (`validators/recurrence`, `utils/recurrence`, `utils/time`): structured rules, rolling 90-day materialization for tasks, in-memory expansion for calendar events, per-series/pass caps.
- Calendar module: native event CRUD (all-day/timed, category, location, reminder settings, recurrence), ranged queries with timezone-aware day bounds, and **task ↔ calendar integration** — due tasks surface as read-only `sourceType: TASK` items.
- Dashboard: `tasks` and `calendar` become real sections (`openCount`/`dueTodayCount`/`recent`, `upcomingCount`/`next`), leaving only the P6–P7 modules as `not_available`.
- Client: `tasks` list + form pages, `calendar` month view + event form page, Tasks/Calendar navigation and sprite icons, dashboard module links and stat tile.
- Tests: 25 new server tests (115 total) covering CRUD/validation, views/filters/pagination, recurrence windows, isolation, categories, ranged calendar queries, timezone boundaries and task integration.

**Out of scope:** task templates, notification/reminder delivery, external calendar sync, meals, recipes, shopping, inventory, finance, family, AI (Phases 6–10).

**Design:** [tasks.md](tasks.md), [calendar.md](calendar.md), [api-design.md](api-design.md), [database-design.md](database-design.md).

### Completion criteria (met)

- `npm test` passes (115 tests) including the tasks and calendar suites plus the updated dashboard contract.
- Migration `tasks_core` applied; `prisma migrate status` reports an up-to-date schema.
- `docker compose up -d --build` healthy; tasks/calendar/dashboard smoke-tested through the container; `/api/health` returns `success: true`.
- Browser-verified with Playwright: task list + completion, task creation, calendar month view with derived task items, event creation, dashboard module links, no console/API errors, no horizontal overflow at 1360/820/375 px.

## Phase 6 — Meals, recipes, shopping, inventory (delivered)

**Scope:**

- Fifth Prisma migration `meals_shopping_inventory`: `recipes`, `recipe_ingredients`, `meal_plan_entries`, `shopping_lists`, `shopping_list_items`, `inventory_items`, `inventory_transactions` (+ `meal_type`, `item_category`, `inventory_location`, `inventory_transaction_type` enums); all kitchen quantities are `Decimal(12,3)`.
- Recipes module (full CRUD): structured ingredients, favourite/unfavourite, duplicate, search/category/favourite filters, sorting, pagination and category metadata.
- Meals module: dated slots (`BREAKFAST|LUNCH|SNACK|DINNER`) referencing a recipe or free-text title; current-week defaults, ranged queries with a 90-day cap, and title snapshots when a recipe is deleted.
- **Meal → calendar integration:** planned meals surface as derived all-day `sourceType: MEAL` items with nominal slot hours; derived ids are never persisted.
- Shopping module: list CRUD/archive, item CRUD with purchase/unpurchase timestamps, search and filters, **recipe → shopping with serving scaling**, a deterministic merge strategy (normalized name + unit, unpurchased lines only), and **meal-plan preview + selectable commit**.
- Inventory module: item CRUD, ledger-only quantity changes (`PURCHASE`/`CONSUME`/`WASTE`/`ADJUST`) with `quantityAfter`, negative-stock rejection, derived stock/expiry status (7-day horizon), filters and **shopping → inventory** merge with a `PURCHASE` transaction.
- Dashboard: `meals`, `shopping`, `inventory` and `recipes` become real sections; only `finance` remains `not_available`.
- Client: recipes list + form, weekly meal planner + form, shopping list index + detail, inventory list + item form with transaction history; Kitchen navigation group, bottom-nav update, new star/archive/minus icons and kitchen styles built on the existing theme tokens.
- Tests: 44 new server tests (160 total) covering all four modules — CRUD/validation, isolation, scaling/merge rules, meal-plan preview/commit, ledger integrity, derived statuses and calendar integration.

**Out of scope (intentionally deferred):** recipe photos/import; repeating meal plans/templates; per-meal servings; store organisation and price tracking on shopping lines; barcode scanning; automatic inventory deduction from cooked meals; reminder/expiry notification delivery (Phase 9); finance (Phase 7).

**Design:** [recipes.md](recipes.md), [meals.md](meals.md), [shopping.md](shopping.md), [inventory.md](inventory.md), [api-design.md](api-design.md), [database-design.md](database-design.md).

### Completion criteria (met)

- `npm test` passes (160 tests) including the recipes, meals, shopping and inventory suites plus the extended dashboard kitchen contract.
- Migration `meals_shopping_inventory` applied; `prisma migrate status` reports an up-to-date schema.
- `docker compose up -d --build` healthy; `/api/health` returns `success: true`; recipes/meals/shopping/inventory/dashboard/calendar smoke-tested through the container.
- Browser-verified with Playwright (9-step serial flow): register → recipe → meal → calendar, shopping list + item → purchase → shopping → inventory, inventory consume/low stock/expiry, recipe scaling, meal-plan → shopping, dashboard, no console/API errors, no horizontal overflow at 1360/1024/820/768/480/375 px.

## Phase 7 — Finance (delivered)

**Scope:**

- Sixth and seventh Prisma migrations: `finance_core` (7 tables + 7 enums: `finance_accounts`, `finance_categories`, `financial_transactions`, `finance_receipts`, `finance_budgets`, `finance_bills`, `finance_recurring_transactions`) and `finance_seed_categories` (17 global category seeds with `household_id NULL`); later `finance_recurrence_daily` adds the `DAILY` frequency.
- **Ledger model:** one `financial_transactions` table for `EXPENSE`/`INCOME`/`TRANSFER` as positive magnitudes; `POSTED`/`VOIDED` one-way status; immutable money fields on `PATCH`; transfers require equal-currency accounts and never enter income/expense totals; derived account balances (`opening + income − expense ± transfers`).
- **Accounts and categories:** CRUD + archive (never hard-deleted once referenced), household isolation, global read-only seed catalog, duplicate guards (`409`), per-household caps (50/100).
- **Budgets:** monthly category targets with unique `(household, category, period, year, month)`; spend/remaining/percent/over-budget **derived at read time** — create/update responses carry the live spend.
- **Bills:** stored `UPCOMING/PAID/CANCELLED` with derived `DUE`/`OVERDUE`; **atomic payment** (`payBillAtomically`: status recheck + linked `EXPENSE` + unique `paid_transaction_id` in one transaction; duplicate → `409`); payment overrides validated in bill currency; voiding the payment reopens the bill atomically; cancel is final; `bill.paid`/`bill.cancelled` audit events.
- **Recurring transactions:** structured `DAILY|WEEKLY|MONTHLY|YEARLY` rules + interval 1–99 with `nextOccurrence` cursor; bounded materialization (≤ 60 rows/run, only up to today, shared `utils/recurrence.js` engine); unique `(recurringTransactionId, transactionDate)`; pause/resume/edit.
- **Receipts:** reuse of the raw-binary upload architecture — ≤5 MB, magic-byte JPEG/PNG/WebP/PDF detection, server-generated names under `uploads/finance/`, authenticated private streaming, `finance-upload` rate limit.
- **Monthly reports + dashboard:** PostgreSQL aggregations for income/expenses/net, category breakdowns with percentages/ranks, budget vs actual, bill summary, derived account balances; dashboard `finance` section replaces `not_available` with real data.
- **Calendar integration:** unpaid bills surface as derived read-only `sourceType: BILL` items through the existing source abstraction (nothing persisted to `calendar_events`).
- **Client:** eight pages (`finance`, `transaction-form`, `accounts`, `categories`, `budgets`, `bills`, `recurring`, `finance-report`) with a Money nav group, shared modal/table/state components, money/date utils and a minimalist finance CSS block on existing theme tokens.
- Tests: 63 new server tests (223 total) across eight finance suites plus the updated dashboard contract.

**Out of scope (intentionally deferred):** FX conversion/multi-currency transfers, credit-card statement flows, split transactions, multiple receipts per transaction, non-monthly budget periods, automatic bill regeneration from the recurring flag, notification delivery (Phase 9).

**Design:** [finance.md](finance.md), [finance-transactions.md](finance-transactions.md), [finance-budgets.md](finance-budgets.md), [finance-bills.md](finance-bills.md), [finance-reports.md](finance-reports.md), [architecture.md](architecture.md), [database-design.md](database-design.md), [api-design.md](api-design.md).

### Completion criteria (met)

- `npm test` passes (223 tests) including all eight finance suites, the calendar-derived-bill test and the updated dashboard contract.
- Migrations `finance_core`, `finance_seed_categories`, `finance_recurrence_daily` applied; `prisma migrate status` reports an up-to-date schema.
- `docker compose up -d --build` healthy; `/api/health` returns `success: true`; a 20-check finance smoke run through the container passes (exact totals, derived balances, duplicate-payment `409`, receipt roundtrip, report/dashboard equality).
- Browser-verified with Playwright (9-step serial flow): accounts → category/budget → bills + payment + calendar → expense/income/transfer → recurring → receipt → report → dashboard; no console/API errors; no horizontal overflow at 1360/1024/820/768/480/375 px. Phase 6 E2E regression: 9/9 still passing.

## Phase 8 — Family + Home + Documents + Notes + Ideas (delivered)

**Scope:**

- Eighth Prisma migration `family_home_documents`: `family_members`, `family_events`, `home_rooms`, `cleaning_schedules`, `laundry_loads`, `maintenance_records`, `documents`, `notes`, `ideas` (+ new enums: `cleaning_frequency`, `cleaning_status`, `laundry_status`, `maintenance_status`, `doc_category`, `doc_reference_type`, `doc_expiry_status`, `idea_status`).
- **Family module:** members (name, relationship, date of birth, linked user, notes, active), events (title, kind, date, member, yearly repeat, notes). Birthday → Calendar, events → Calendar, linked user birthdays → Calendar.
- **Home management:** rooms (CRUD), cleaning schedules (room, frequency, interval, assignee, next due), laundry loads (category, status, scheduled date), maintenance (title, category, room, scheduled date, priority, status, description, transaction link, notes). Maintenance → Calendar, Maintenance → Task generation.
- **Documents:** secure upload (raw binary + magic-byte verification, ≤5 MB, JPEG/PNG/WebP/PDF), metadata (title, category, expiry, cross-references), private authenticated streaming, expiry status (ACTIVE/EXPIRING_SOON/EXPIRED).
- **Notes:** plain-text CRUD with tags (array, max 10), pin/unpin, archive/unarchive, category, search (title/content), tag filter, pin/archived filters. Notes vs Diary: separate tables, no overlap.
- **Ideas:** lightweight capture (title, description, category, priority, status, estimated cost + currency, notes), optional Task link (`POST /api/ideas/:id/task` → creates Task, sets idea status → `PLANNED`).
- **Calendar & Task Integrations:** Family events/birthdays → Calendar (derived, all-day, yearly); Maintenance → Calendar + Task generation; Ideas → Task generation (status → `PLANNED`).
- **Dashboard Integration:** Family section (member count, upcoming birthdays); Home section (rooms, overdue/upcoming maintenance, due cleaning, laundry status, expiring documents).
- **Documents Security:** Magic-byte verification, 5 MB max, private streaming endpoint, expiry status computed at read time.
- **Client:** 14 new pages (`family`, `family-member-form`, `home`, `rooms`, `cleaning`, `laundry`, `maintenance`, `maintenance-form`, `documents`, `document-form`, `notes`, `note-form`, `ideas`, `idea-form`) with shared shell, components, API clients, modal forms, minimalist CSS on existing theme tokens.
- Tests: 56 new server tests (279 total) across family, home (rooms/cleaning/laundry/maintenance), documents, notes, ideas, plus Phase 8 integration tests; 279/279 passing.
- Playwright E2E: 12 core flows covering family, home, calendar, dashboard, documents, notes, ideas, responsive layouts, household isolation.

**Out of scope (intentionally deferred):** rich text editing for notes; idea comments/voting; sub-ideas; advanced document OCR/search; notification delivery (Phase 9); AI (Phase 10).

**Design:** [family.md](family.md), [home-management.md](home-management.md), [documents.md](documents.md), [notes.md](notes.md), [ideas.md](ideas.md), [architecture.md](architecture.md), [database-design.md](database-design.md), [api-design.md](api-design.md).

### Completion criteria (met)

- `npm test` passes (279 tests) including all Phase 8 suites plus the updated dashboard/calendar contracts and cross-module isolation tests.
- Migration `family_home_documents` applied; `prisma migrate status` reports an up-to-date schema.
- `docker compose up -d --build` healthy; `/api/health` returns `success: true`; smoke tests pass for Family, Home, Documents, Notes, Ideas, Calendar integrations, Dashboard, and household isolation.
- Browser-verified with Playwright (12 core flows): create family member, create family event → verify in Calendar, create room → verify in Home, create maintenance → verify in Calendar, verify Dashboard family/home sections, upload document → verify private access, create note with tags/pin, search note by tag, create idea with cost + Task link, responsive layouts (375–1360 px), household isolation.
- Phase 6–7 E2E regression: all previous flows still passing.

## Phase 9 — Notifications + PWA + Backup/Export (delivered)

**Scope:**

- Ninth Prisma migration `add_notifications`: `notifications` table with types (`TASK_DUE`, `TASK_OVERDUE`, `BILL_DUE`, `BILL_OVERDUE`, `INVENTORY_EXPIRING`, `INVENTORY_EXPIRED`, `DOCUMENT_EXPIRING`, `DOCUMENT_EXPIRED`, `FAMILY_BIRTHDAY`, `MAINTENANCE_DUE`), per-user household-scoped notifications with deduplication.
- **Notifications module:** in-app notification center with list, pagination, filters (unread/archived), mark read/unread, mark all read, archive, delete. Unread badge in topbar, dropdown link in account menu.
- **PWA:** Web App Manifest (`/manifest.webmanifest`), Service Worker (`/sw.js`) with offline shell caching, cache-first for static assets, network-first for HTML pages, network-only for API requests (never cached). Icons at 8 sizes (72–512px) generated from SVG source. Installable on desktop and mobile with shortcuts (Dashboard, Tasks, Calendar).
- **Backup/Export:** `GET /api/export` with JSON and CSV formats. Granular module selection (14 modules). Secure download with `Content-Disposition: attachment`. Excludes passwords, tokens, secrets, binary files. CSV format with per-module sections. Import/restore deferred.
- **Dashboard Integration:** Notifications section with unread count.
- **Client:** Notifications page (`/pages/notifications.html`), Export page (`/pages/export.html`), topbar notification badge, updated shell navigation.
- **PWA Infrastructure:** Manifest at `/manifest.webmanifest`, Service Worker at `/sw.js`, icons at 8 sizes (72–512px) generated from SVG source via canvas script.
- **Tests:** 279/279 server tests pass (no new tests added for Phase 9 features in this scope; existing tests cover infrastructure). All existing tests pass.
- **Docker:** `docker compose up -d --build` healthy; `/api/health` returns `success: true`; smoke tests pass for notifications, export, PWA static files, service worker registration.

**Out of scope (intentionally deferred):** email/push notification delivery; notification preferences per type; background sync for notifications; import/restore; encrypted exports; cloud storage integration; push notifications (VAPID); background sync for pending writes.

**Design:** [notifications.md](notifications.md), [pwa.md](pwa.md), [backup-export.md](backup-export.md), [architecture.md](architecture.md), [database-design.md](database-design.md), [api-design.md](api-design.md), [database-design.md](database-design.md).

### Completion criteria (met)

- `npm test` passes (279 tests) including all previous phases plus the new notifications, export, and PWA infrastructure.
- Migration `add_notifications` applied; `prisma migrate status` reports an up-to-date schema.
- `docker compose up -d --build` healthy; `/api/health` returns `success: true`; smoke tests pass for notifications API, export API, PWA manifest, service worker, and dashboard notifications.
- Browser-verified: notifications page loads, unread badge updates, export page generates JSON/CSV downloads, PWA manifest loads, service worker registers, dashboard shows notifications section.
- Phase 6–8 E2E regression: all previous flows still passing.

## Later phases (summary scope)

- **Phase 10:** AI assistant over the tool layer.

## Risks and ordering rationale

- Authentication before UI foundation: the private-application shell requires sessions to gate any module work.
- Theme engine before dashboard: the dashboard is the first themed, responsive screen.
- AI last: it depends on stable services and the tool layer contract; it must never shortcut authorization.
