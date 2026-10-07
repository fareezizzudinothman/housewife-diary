# Database design

PostgreSQL accessed exclusively through Prisma. The schema is **grown phase by phase** — this document is the design reference; tables are only created when their phase begins. Migrations so far: `20261007041913_auth_core` (Phase 2, identity tables) and `20261007052226_theme_preferences` (Phase 3, theme tables).

## Principles

1. **Migrations only.** Schema changes go through `prisma migrate dev` (committed under `prisma/migrations/`); containers apply them with `prisma migrate deploy`. No `db push` outside throwaway experiments.
2. **Snake_case tables and columns** via `@@map`/`@map` — Prisma models stay PascalCase/camelCase in code.
3. **Foreign keys everywhere** relationships exist; `onDelete` behavior chosen explicitly per relation.
4. **Indexes where justified:** every foreign key used in hot paths, every `household_id` scoping column, and columns filtered or sorted frequently. No speculative indexes.
5. **Timestamps on every table:** `createdAt`, `updatedAt` (`@default(now())` / `@updatedAt`).
6. **Household isolation:** every household-scoped table carries `household_id`; queries are always filtered by the household resolved from the session (never client-supplied).
7. **No premature complexity:** soft deletes only where a module needs history (e.g. receipts); enums for closed sets (roles, priorities, recurrence units); `Decimal` for money.
8. **Normalization:** repeating concepts become their own tables (categories, stores, ingredients) so price tracking and reporting stay meaningful.

## Core identity model (Phase 2 — implemented)

```text
users                    id, email (unique, citext-style lowercase), password_hash,
                         name, timezone, email_verified_at, active_household_id,
                         created_at, updated_at
sessions                 id, user_id (FK), token_hash (unique), expires_at,
                         remember_me, user_agent, ip, created_at
households               id, name, owner_user_id (FK users), created_at, updated_at
household_members        id, household_id (FK), user_id (FK), role (OWNER|ADMIN|MEMBER|VIEWER),
                         joined_at — unique (household_id, user_id)
password_reset_tokens    id, user_id (FK), token_hash, expires_at, used_at, timestamps
email_verification_tokens id, user_id (FK), token_hash, expires_at, used_at, timestamps
```

A user may belong to several households; `users.active_household_id` selects the working context. The sessions table is server-side state, enabling revocable, expiring sessions (see [authentication.md](authentication.md)). Reset/verification tokens are stored hashed with a TTL and are single-use (`used_at`).

## Theme and preference model (Phase 3 — implemented)

```text
themes                   id (text = slug), slug (unique), name, mood,
                         mode (LIGHT|DARK|BOTH), is_default, sort_order,
                         tokens (jsonb: {"light": {…}, "dark": {…}}), timestamps
user_preferences         id, user_id (FK, unique), theme_id (FK themes, SET NULL),
                         theme_overrides (jsonb), color_mode (LIGHT|DARK|SYSTEM),
                         density (COMPACT|COMFORTABLE),
                         nav_style (SIDEBAR|BOTTOM), timestamps
```

`themes` is global catalog data seeded with nine presets; `user_preferences` is per-user and written lazily (a row is created on the first appearance change). `theme_overrides` holds only the validated allowlisted variables (see [theme-system.md](theme-system.md)); deleting a preset nulls the reference rather than deleting user rows.

## Planned entity map by module

| Module | Tables | Highlights |
| --- | --- | --- |
| Diary (P4) | `diary_entries`, `moods`, `diary_tags`, `diary_attachments` | entries scoped per user-in-household, tag many-to-many, attachments reference `documents` |
| Tasks (P5) | `tasks`, `task_categories`, `task_templates`, `task_recurrences` | priority/due/assignee; recurrence rules expand into dated tasks |
| Calendar (P5) | `calendar_events` | unified view over tasks, bills, birthdays via queries, own events stored here |
| Meals (P6) | `meals`, `recipes`, `recipe_ingredients`, `ingredients` | meal slots (breakfast/lunch/dinner/snack) by date; recipes favoriteable |
| Shopping (P6) | `shopping_lists`, `shopping_items`, `stores` | purchased flags, price tracking per item/store |
| Inventory (P6) | `inventory_items`, `inventory_categories`, `inventory_transactions` | location (pantry/fridge/freezer/supplies), quantity, minimum stock, expiry, transaction ledger (add/remove/consume) |
| Finance (P7) | `expenses`, `expense_categories`, `budgets`, `bills`, `receipts` | expenses/income via signed amount or type flag; budgets per category/period; bills recurring rules |
| Family (P8) | `family_members`, `family_events` | household profiles (may or may not be users), birthdays/important dates |
| House mgmt (P8) | `home_areas`, `cleaning_tasks`, `maintenance_records` | areas (kitchen/bathroom/garden…), schedules, history |
| Home inventory (P8) | `home_assets`, `warranties` | purchase dates, warranty docs linked to `documents` |
| Documents (P8) | `documents` | typed (receipt/warranty/insurance/bill/other), metadata, stored under `uploads/` |
| Notes & ideas (P8) | `notes`, `ideas` | lightweight household/user content, wishlist flag on ideas |
| Notifications (P9) | `notifications` | per-user, read flags, generated by reminder engine |
| AI (P10) | `ai_conversations`, `ai_messages` | persisted assistant history; actions recorded with audit trail |

## Phase mapping

Only the tables of the current phase are created. Each phase's migration is reviewed for: FK correctness, index justification, isolation scoping, and rollback sanity.

## Operational notes

- Connection string comes from `DATABASE_URL` (root `.env` for Compose, `app/.env` for local dev).
- The Docker Compose `postgres` service uses a named volume `postgres_data` — data survives `docker compose down`; only `docker compose down -v` destroys it (destructive — never run casually).
- Prisma Client is generated at image build (`prisma generate`) and migrations applied at container start (`prisma migrate deploy`).
