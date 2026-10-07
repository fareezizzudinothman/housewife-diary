# Housewife Diary

A warm, modern household management web application — a personal digital household companion for diary, tasks, meals, shopping, inventory, finances, family and home.

> **Status:** Phase 0–1 (architecture specification + project foundation) complete.
> The API server, PostgreSQL and Prisma are connected and verified. Business modules arrive phase by phase — see [docs/implementation-plan.md](docs/implementation-plan.md).

## Planned modules

| Area | Modules |
| --- | --- |
| Personal | Diary, mood tracking, notes, ideas, documents |
| Household | Tasks, recurring tasks, calendar, cleaning, laundry, maintenance |
| Food | Meal planner, recipes, shopping lists, pantry/inventory |
| Money | Expenses, income, budgets, bills, receipts, reports |
| People | Family members, family events, household roles |
| Home | Home inventory, appliances, warranties |
| Platform | Authentication, dashboard, notifications, themes, PWA, backup/export |
| Assistant | AI household assistant (tool-based, household-scoped) |

## Technology stack

- **Backend:** Node.js, Express (REST API), Prisma ORM, PostgreSQL
- **Frontend:** HTML5, CSS3, vanilla JavaScript ES modules (no frameworks, no Tailwind)
- **Infrastructure:** Docker + Docker Compose
- **Testing:** Node.js built-in test runner

## Repository layout

Per the project architecture, all application files live inside `app/`. The repository root intentionally contains only Docker Compose configuration plus Git/environment housekeeping files:

```text
housewife-diary/
├── docker-compose.yml      # app + postgres services (root .env drives secrets)
├── .gitignore
└── app/                    # the application (see structure below)
```

```text
app/
├── Dockerfile              # application image (must stay here, not at root)
├── package.json
├── package-lock.json
├── .env.example            # template for app/.env (local development)
├── prisma/                 # schema + migration history
├── src/
│   ├── server/             # config, routes, controllers, services,
│   │                       # repositories, validators, middleware, utils
│   ├── client/             # index.html, css/, js/ (ES modules), pages/, components/
│   └── shared/             # contracts shared by server and client
├── public/                 # static assets
├── tests/                  # node:test suites
├── docs/                    # project documentation
└── uploads/                 # runtime file uploads (gitignored, private data)
```

## Prerequisites

- Docker and Docker Compose v2 (recommended path), **or**
- Node.js ≥ 20 and a reachable PostgreSQL 16+ for local development

## Quick start (Docker Compose)

1. Create the Compose environment file at the **repository root** (never commit it — `.git` is already configured to ignore it):

   ```bash
   cd /home/fareezio/projects/housewife-diary
   cp <block below>    # create a file named .env with:

   POSTGRES_USER=housewife
   POSTGRES_PASSWORD=your_local_password      # change this
   POSTGRES_DB=housewife_diary
   # Optional overrides:
   # APP_PORT=3200        # host port for the web app (default 3200)
   # POSTGRES_PORT=5434   # host port for PostgreSQL (default 5434)
   ```

2. Start the stack:

   ```bash
   docker compose up -d --build
   ```

3. Open the app at `http://localhost:3200` and verify the services:

   ```bash
   curl http://localhost:3200/api/health
   ```

   A healthy response looks like:

   ```json
   {
     "success": true,
     "data": {
       "status": "ok",
       "service": "housewife-diary",
       "database": "connected",
       "timestamp": "…"
     }
   }
   ```

To stop the stack (PostgreSQL data persists in the `postgres_data` volume):

```bash
docker compose down
```

> **Ports:** the defaults `3200` (app) and `5434` (PostgreSQL) were chosen because `3000`/`5432` are commonly occupied on this machine by other projects. Override them via `APP_PORT` / `POSTGRES_PORT` in the root `.env`.

## Local development (without Docker for the app)

1. Start PostgreSQL only (or use your own PostgreSQL 16+):

   ```bash
   docker compose up -d postgres
   ```

2. Configure the application environment:

   ```bash
   cd app
   cp .env.example .env
   # set DATABASE_URL to match the POSTGRES_* values in the root .env
   ```

3. Install dependencies, apply migrations and run:

   ```bash
   npm install
   npm run db:generate      # generate the Prisma Client
   npm run dev             # http://localhost:3200
   ```

4. Run the test suite (requires a reachable PostgreSQL, uses `app/.env`):

   ```bash
   npm test
   ```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Start the server |
| `npm run dev` | Start with watch mode |
| `npm test` | Run the test suite (`node --test`) |
| `npm run db:generate` | Generate the Prisma Client |
| `npm run db:migrate` | Create/apply migrations in development |
| `npm run db:deploy` | Apply pending migrations (used by the container) |
| `npm run db:status` | Show migration status |
| `npm run db:studio` | Open Prisma Studio |

## Environment variables

**Root `.env` (Docker Compose):**

| Variable | Required | Purpose |
| --- | --- | --- |
| `POSTGRES_USER` | yes | PostgreSQL superuser name |
| `POSTGRES_PASSWORD` | yes | PostgreSQL password (local secret, never commit) |
| `POSTGRES_DB` | yes | Database name |
| `APP_PORT` | no | Host port for the app (default `3200`) |
| `POSTGRES_PORT` | no | Host port for PostgreSQL (default `5434`) |
| `NODE_ENV` | no | App container mode (default `production`) |

**`app/.env` (local Node development — see `app/.env.example`):**

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection URL (overridden by Compose in Docker) |
| `PORT` | no | Local server port (default `3000`; example uses `3200`) |
| `NODE_ENV` | no | Runtime mode (default `development`) |
| `SESSION_SECRET` | Phase 2 | Session signing secret (unused until authentication lands) |

## Documentation

- [Architecture](docs/architecture.md)
- [Implementation plan](docs/implementation-plan.md)
- [Database design](docs/database-design.md)
- [API design](docs/api-design.md)
- [Authentication (Phase 2 plan)](docs/authentication.md)
- [Theme system (Phase 3 plan)](docs/theme-system.md)
- [Development workflow](docs/development-workflow.md)
- [AI architecture (Phase 10 plan)](docs/ai-architecture.md)

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Architecture and project specification | Complete |
| 1 | Foundation: Node.js, PostgreSQL, Prisma, Docker, Git, docs, health check | Complete |
| 2 | Authentication and household management | Planned |
| 3 | UI foundation and theme engine | Planned |
| 4 | Dashboard and diary | Planned |
| 5 | Tasks and calendar | Planned |
| 6 | Meals, recipes, shopping, inventory | Planned |
| 7 | Finance, bills, budgets, reports | Planned |
| 8 | Family, home management, home inventory, documents | Planned |
| 9 | Notifications, PWA, backup/export | Planned |
| 10 | AI assistant and household automation | Planned |

## Security notes

- No secrets are committed: `.env` files are gitignored, and `.env.example` files contain placeholders only.
- The API sets secure HTTP headers via `helmet` and validates its environment on startup.
- The app container runs as the unprivileged `node` user.
- Authentication (password hashing, sessions, rate limiting) is specified in [docs/authentication.md](docs/authentication.md) and implemented in Phase 2.
