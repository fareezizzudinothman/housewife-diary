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
| 7 | Finance, expenses, bills, budgets, reports | Planned |
| 8 | Family, home management, home inventory, documents | Planned |
| 9 | Notifications, PWA, backup, export | Planned |
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

## Later phases (summary scope)

- **Phase 7:** expenses, income, categories, budgets, bills, receipts, monthly reports.
- **Phase 8:** family members/events, cleaning & house management, home assets/warranties, documents, notes, ideas.
- **Phase 9:** notification center, PWA, backup/export.
- **Phase 10:** AI assistant over the tool layer.

## Risks and ordering rationale

- Authentication before UI foundation: the private-application shell requires sessions to gate any module work.
- Theme engine before dashboard: the dashboard is the first themed, responsive screen.
- AI last: it depends on stable services and the tool layer contract; it must never shortcut authorization.
