# Database design

PostgreSQL accessed exclusively through Prisma. The schema is **grown phase by phase** — this document is the design reference; tables are only created when their phase begins. Migrations so far: `20261007041913_auth_core` (Phase 2, identity tables), `20261007052226_theme_preferences` (Phase 3, theme tables), `20261007071119_diary_core` (Phase 4, diary tables + mood seeds), `20261007084410_tasks_core` (Phase 5, tasks + calendar tables) and `20261007100833_meals_shopping_inventory` (Phase 6, recipes + meals + shopping + inventory tables).

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

## Diary model (Phase 4 — implemented)

```text
moods                   id (text = slug), name, sort_order, timestamps
                         — seeded catalog (10): happy, calm, loved, excited, neutral,
                           tired, sad, stressed, angry, anxious
diary_entries           id, household_id (FK), user_id (FK), entry_date (YYYY-MM-DD),
                         time_of_day (MORNING|AFTERNOON|EVENING), title, content,
                         mood_id (FK moods, SET NULL), created_at, updated_at
                         — index (household_id, user_id, entry_date DESC)
diary_tags              id, household_id (FK), user_id (FK), name (lowercase),
                         created_at — unique (household_id, user_id, name)
diary_entry_tags        diary_entry_id (FK), tag_id (FK) — composite PK, cascade
diary_attachments       id, diary_entry_id (FK, cascade), original_name, stored_name
                         (random hex + validated extension), mime_type, size_bytes,
                         created_at — max 5 rows per entry enforced in the service
```

Entries are personal to an author **within** a household: every query filters `{householdId, userId}`, so household members cannot read each other's diaries (404), and an entry belongs forever to the household it was written in. `mood_id` is `SET NULL` so deleting a catalog mood never deletes entries. Tags are per-user rows joined many-to-many; names are normalized to lowercase and deduplicated. Attachment bytes live under `app/uploads/diary/` (a Docker volume, gitignored) — the database stores metadata only, `stored_name` is server-generated and never exposed through the API. Moods are seeded by the migration (ten rows, `sort_order` 1–10).

## Tasks and calendar model (Phase 5 — implemented)

```text
task_categories   id, household_id (FK, cascade), name, normalized, created_at
                  — unique (household_id, normalized); max 50 per household in the service
tasks             id, household_id (FK, cascade), created_by_id (FK users, cascade),
                  assigned_to_id (FK users, SET NULL), category_id (FK, SET NULL),
                  title, description, status (task_status), priority (task_priority),
                  due_at, completed_at, recurrence (jsonb), series_id (FK tasks, cascade),
                  created_at, updated_at
                  — indexes (household_id, status), (household_id, due_at),
                    (household_id, assigned_to_id), (household_id, created_at), (series_id)
calendar_events   id, household_id (FK, cascade), created_by_id (FK users, cascade),
                  title, description, start_at, end_at, all_day,
                  category (calendar_category), location, recurrence (jsonb),
                  reminder_offset_minutes, reminder_enabled,
                  source_type (calendar_source_type, default MANUAL), source_id,
                  created_at, updated_at
                  — indexes (household_id, start_at), (household_id, end_at),
                    (household_id, source_type), (household_id, source_id)
```

Recurring **tasks** store the rule on a series head and materialize bounded occurrence rows (`series_id` self-relation, `onDelete: Cascade`); recurring **calendar events** keep the rule on the head only and expand in memory per ranged query. `assigned_to_id` and `category_id` are `SET NULL` so removing a member or category never deletes history. `source_type`/`source_id` reserve the calendar for derived items — only `MANUAL` rows are ever persisted. Reminder columns are stored foundation; delivery arrives in Phase 9. Full design: [tasks.md](tasks.md), [calendar.md](calendar.md).

## Recipes, meals, shopping and inventory model (Phase 6 — implemented)

```text
recipes              id, household_id (FK, cascade), created_by_id (FK users, cascade),
                     title, description, instructions, servings, prep_minutes, cook_minutes,
                     category, cuisine, is_favourite, notes, created_at, updated_at
                     — indexes (household_id, updated_at DESC), (household_id, is_favourite)

recipe_ingredients   id, recipe_id (FK recipes, cascade), name, normalized,
                     quantity Decimal(12,3) NULL, unit, optional, notes, sort_order
                     — indexes (recipe_id, sort_order), (normalized)

meal_plan_entries    id, household_id (FK, cascade), created_by_id (FK users, cascade),
                     recipe_id (FK recipes, SET NULL), date (DATE), meal_type (meal_type enum),
                     title, notes, created_at, updated_at
                     — indexes (household_id, date), (household_id, meal_type), (recipe_id)

shopping_lists       id, household_id (FK, cascade), created_by_id (FK users, cascade),
                     name, notes, archived_at, created_at, updated_at
                     — index (household_id, archived_at)

shopping_list_items  id, list_id (FK shopping_lists, cascade), recipe_id (FK recipes, SET NULL),
                     name, normalized, quantity Decimal(12,3) NULL, unit,
                     category (item_category enum, default OTHER), notes, purchased_at,
                     created_at, updated_at
                     — indexes (list_id, purchased_at), (list_id, category), (normalized)

inventory_items      id, household_id (FK, cascade), created_by_id (FK users, cascade),
                     name, normalized, quantity Decimal(12,3) default 0, unit,
                     category (item_category), location (inventory_location default PANTRY),
                     expires_at (DATE) NULL, minimum_quantity Decimal(12,3) default 0,
                     notes, created_at, updated_at
                     — indexes (household_id, normalized), (household_id, expires_at),
                       (household_id, category), (household_id, location)

inventory_transactions id, household_id (FK, cascade), item_id (FK inventory_items, cascade),
                     created_by_id (FK users, cascade), type (inventory_transaction_type),
                     quantity_delta Decimal(12,3), quantity_after Decimal(12,3), note, created_at
                     — indexes (item_id, created_at DESC), (household_id, created_at DESC)
```

Enums: `meal_type` (`BREAKFAST|LUNCH|SNACK|DINNER`), `item_category` (nine shared kitchen categories), `inventory_location` (`PANTRY|REFRIGERATOR|FREEZER|HOUSEHOLD|OTHER`), `inventory_transaction_type` (`PURCHASE|CONSUME|WASTE|ADJUST`).

- All kitchen quantities are `Decimal(12,3)`; `normalized` names are the cross-module matching keys (recipe ingredient → shopping line → inventory item).
- `recipe_id` on meal entries and shopping items is `SET NULL`: deleting a recipe never removes planned meals or shopping history (meals keep a title snapshot).
- Deleting a shopping list cascades its items; deleting an inventory item cascades its ledger.
- Statuses (stock level, expiry) are **derived at read time**, never stored — see [inventory.md](inventory.md).
- Full design: [recipes.md](recipes.md), [meals.md](meals.md), [shopping.md](shopping.md), [inventory.md](inventory.md).

## Planned entity map by module

| Module | Tables | Highlights |
| --- | --- | --- |
| Meals (P6) | `recipes`, `recipe_ingredients`, `meal_plan_entries` | structured ingredients; meal slots by date; recipe reference with title snapshot |
| Shopping (P6) | `shopping_lists`, `shopping_list_items` | purchased timestamp, recipe/meal-plan merge by normalized name + unit |
| Inventory (P6) | `inventory_items`, `inventory_transactions` | location, quantity, minimum stock, expiry; full transaction ledger with `quantity_after` |
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
