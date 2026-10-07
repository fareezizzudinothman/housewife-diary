# Development workflow

How work happens on Housewife Diary — branching, commits, phases, environment files, testing and the push checklist.

## Branching model

```text
main            stable baseline (foundation now; releases later)
develop         integration line for completed phase work
feature/*       one branch per phase/module unit of work
fix/*           bugfixes
chore/* docs/*  tooling and documentation
```

- Phase work starts with `git switch -c feature/<name>` from `develop`.
- Work is committed early and often on the feature branch; the phase is integrated into `develop` when its completion criteria are met.
- `main` advances at stable milestones (foundation now; phase completions later).
- No force-push. No history rewrites on shared branches.

Current branches: `main`, `develop`, `feature/project-foundation` (all at the foundation commit).

## Commit messages

Conventional, imperative, scoped to a real change:

```text
chore: initialize project structure
docs: add system architecture
feat: implement authentication
feat: add theme engine
fix: resolve authentication session issue
```

Never: `update`, `changes`, `test`, `stuff`.

## Phase workflow (every change)

1. Read the relevant docs (architecture, implementation plan, database/API/auth/theme as applicable).
2. Inspect the current code and schema — never assume.
3. Confirm the requested scope; do not implement future phases early.
4. Implement only that scope.
5. Test: `npm test` (needs a reachable PostgreSQL + `app/.env`); smoke `npm run dev` / `curl /api/health`.
6. Update the documentation affected by the change.
7. Review `git status` and `git diff` fully — no accidental files, no secrets.
8. Commit with a meaningful message.
9. Push the branch when appropriate; integrate to `develop`.

## Environment files

| File | Purpose | Committed? |
| --- | --- | --- |
| `.env` (repository root) | Docker Compose: `POSTGRES_USER/PASSWORD/DB`, optional `APP_PORT`, `POSTGRES_PORT`, `NODE_ENV` | **No** (gitignored) |
| `app/.env` | Local Node dev + tests: `DATABASE_URL`, `PORT`, `NODE_ENV`, `SESSION_SECRET` | **No** (gitignored) |
| `app/.env.example` | Template with placeholders | Yes |

Rules:

- The root `.env` is the single source for Compose secrets; the app container's `DATABASE_URL` is built from it by `docker-compose.yml` (host `postgres`).
- Local dev `app/.env` points at `localhost:5434` (the compose-published PostgreSQL port).
- Generate secrets properly: `openssl rand -hex 16` (DB password), `openssl rand -base64 48` (`SESSION_SECRET`).
- A missing required variable fails startup with a clear message — never hardcode fallbacks.

## Docker workflow

```bash
docker compose config          # validate the compose file
docker compose up -d postgres  # database only (for local dev)
docker compose up -d --build    # full stack
docker compose ps              # health status (healthy = wget /api/health ok)
docker compose logs -f app     # watch server + migrate deploy output
docker compose down            # stop (data persists in postgres_data volume)
```

`docker compose down -v` deletes the database volume — destructive, never run casually.

## Testing strategy

- **Unit (node:test):** pure logic — config parsing, validators, service logic with faked repositories.
- **Integration (node:test):** real app + real PostgreSQL (ephemeral ports) — API contracts, envelopes, auth boundaries, household isolation.
- **Manual smoke:** `curl /api/health`, browse the client, theme behavior.
- A feature is not complete until its critical behavior has a failing-then-passing test. Tests requiring auth use the helpers in `tests/helpers/` (cookie-jar API client with automatic CSRF, fixtures for creating users/households).

## Pre-push checklist

1. `git status` — only intended changes.
2. `git diff` reviewed in full (staged and unstaged).
3. `npm test` green.
4. Stack verified: `docker compose ps` healthy where applicable.
5. No secrets: `git ls-files | grep -E '\.env$'` returns nothing; `.env.example` contains placeholders only.
6. Docs updated for the change.
7. Commit message follows the conventions above.
8. Push the branch (`git push -u origin <branch>`); open a PR into `develop` for phase integration.

## Secrets policy

- Never commit: `.env` files, `node_modules/`, private uploads, credentials, API keys, certificates.
- New secret types get an `.env.example` placeholder + documentation entry in the same change that introduces their use.
- If a secret is ever committed by accident: rotate it immediately, then clean history deliberately (requires explicit instruction — never rewrite shared history silently).
