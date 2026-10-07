# Implementation plan

Housewife Diary is built phase by phase. Each phase has explicit scope and completion criteria; no phase starts before its predecessor is stable, and no future phase's code is written early. The workflow for every change is defined in [development-workflow.md](development-workflow.md).

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Architecture and project specification | **Complete** |
| 1 | Foundation: Node.js, PostgreSQL, Prisma, Docker, Git, documentation, health check | **Complete** |
| 2 | Authentication and household management | Next |
| 3 | UI foundation and theme engine | Planned |
| 4 | Dashboard and diary | Planned |
| 5 | Tasks and calendar | Planned |
| 6 | Meals, recipes, shopping, inventory | Planned |
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

## Phase 2 — Authentication and household management (next)

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

## Later phases (summary scope)

- **Phase 3:** responsive layout shell, reusable components (modal, toast, table, form, empty/loading/error states), theme engine with presets and per-user customization.
- **Phase 4:** dashboard aggregation endpoint + diary, mood, daily activities.
- **Phase 5:** tasks, categories, recurring tasks, calendar events.
- **Phase 6:** meal planner, recipes, ingredients, shopping lists, pantry/inventory with transactions and low-stock alerts.
- **Phase 7:** expenses, income, categories, budgets, bills, receipts, monthly reports.
- **Phase 8:** family members/events, cleaning & house management, home assets/warranties, documents, notes, ideas.
- **Phase 9:** notification center, PWA, backup/export.
- **Phase 10:** AI assistant over the tool layer.

## Risks and ordering rationale

- Authentication before UI foundation: the private-application shell requires sessions to gate any module work.
- Theme engine before dashboard: the dashboard is the first themed, responsive screen.
- AI last: it depends on stable services and the tool layer contract; it must never shortcut authorization.
