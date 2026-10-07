# Tasks module

Household to-dos with categories, assignment, due dates and simple recurrence (Phase 5). The module follows the same layering as the diary: `taskValidators` → `taskRepository` → `taskService` → `taskController` → `tasks.routes`. Endpoint tables live in [api-design.md](api-design.md); tables in [database-design.md](database-design.md).

## Scope

- Task CRUD with title, notes, status, priority, due date/time, category and assignee.
- Household-wide categories (create, list with usage counts, delete) — deleting a category leaves its tasks intact.
- Views (`today`, `upcoming`, `overdue`, `completed`, `all`) plus filters (status, priority, category, assignee, search), sorting and pagination.
- Recurring tasks: a structured rule on a **series head**, materialized into dated occurrence rows inside a bounded rolling window.
- Completion, reopening, and series-aware deletion.
- Tasks with a due date surface on the calendar as read-only derived items (see [calendar.md](calendar.md)).

Out of scope (later phases): task templates, notifications/reminders, meals, finance, AI.

## Scope and access model

```text
task visibility = { household_id }  (resolved from the session, never the client)
```

Tasks are shared with every member of the active household. Cross-household ids return `404` (no existence leak); a user with no active household gets `403`. Assignees and categories are validated against the **same** household.

## Data model

```text
task_categories   id, household_id (FK, cascade), name, normalized, created_at
                  — unique (household_id, normalized); max 50 per household
tasks             id, household_id (FK, cascade), created_by_id (FK users),
                  assigned_to_id (FK users, SET NULL), category_id (FK, SET NULL),
                  title, description, status (TODO|IN_PROGRESS|COMPLETED|CANCELLED),
                  priority (LOW|MEDIUM|HIGH|URGENT), due_at, completed_at,
                  recurrence (jsonb rule | null), series_id (FK tasks, cascade),
                  created_at, updated_at
```

- The **series head** is a normal task with `recurrence` set and `series_id = NULL`; the head's `due_at` is the first occurrence.
- **Occurrences** are normal task rows with `series_id` pointing at the head and `recurrence = NULL`. They can be completed, edited and deleted individually. Deleting the head cascades its occurrences.
- `recurrence` shape: `{ "frequency": "DAILY|WEEKLY|MONTHLY|YEARLY", "interval": 1-99, "daysOfWeek"?: [0-6], "endDate"?: "YYYY-MM-DD" }`. `daysOfWeek` is weekly-only.
- Indexes: `(household_id, status)`, `(household_id, due_at)`, `(household_id, assigned_to_id)`, `(household_id, created_at)`, `(series_id)`.

## Due dates and timezones

- A **date-only** due date is stored as the last millisecond of that day in the user's timezone (`users.timezone`, default UTC): `2026-10-10` → `2026-10-10T23:59:59.999Z` for UTC, `…16:59:59.999Z` for UTC+7. The client then renders "all day" naturally.
- A date **and time** is stored as an exact UTC instant.
- `today` / `upcoming` / `overdue` boundaries are computed in the user's timezone from the session user, so a task never drifts across days.

## Recurrence materialization

Calendar math (`src/server/utils/recurrence.js`) generates occurrence instants on **UTC calendar dates anchored at the series start**, keeping the start's time-of-day; local wall-clock rendering can shift by an hour across DST changes (documented trade-off — the pattern itself stays stable and DST-free in the database).

- On create, the head is written first, then occurrences are materialized from the day after the anchor to `min(rule end, now + 90 days)`, covering a short slice of the recent past for series anchored in the past.
- On every task **list** request the service extends each series lazily when its window runs low (up to 24 extension passes per call).
- Hard caps: at most **365 occurrence rows per series**; weekly `daysOfWeek` expands only on the selected weekdays; monthly skips months without the anchor day (no 31st in February); yearly skips Feb 29 in non-leap years.
- Editing a head's `dueAt` or `recurrence` deletes the still-open occurrences and regenerates them from the new anchor; completed occurrences are kept as history. Content-only edits (title, notes, priority, category, assignee) are mirrored onto open occurrences.
- Editing/deleting a single occurrence never touches the rest of the series; `DELETE /api/tasks/:id?series=true` removes the whole series when called with an occurrence id.

## Validation rules

Enforced server-side in `taskValidators` (client checks are UX only):

| Field | Rule |
| --- | --- |
| `title` | 1–200 chars after trim; single-line (control chars stripped) |
| `description` | ≤5,000 chars; C0/C1 control chars removed, newlines kept |
| `status` | `TODO` \| `IN_PROGRESS` \| `COMPLETED` \| `CANCELLED` |
| `priority` | `LOW` \| `MEDIUM` \| `HIGH` \| `URGENT` |
| `dueAt` | `YYYY-MM-DD` (1900–2100) **or** an ISO instant with explicit offset |
| `assignedToId` | Cuid-like id; must be a member of the active household |
| `categoryId` | Cuid-like id; must belong to the active household (`null` clears) |
| `recurrence` | allowed keys only; frequency from the enum; interval 1–99; weekdays 0–6 unique, weekly-only; `endDate` ≥ the anchor date; a recurring task needs a due date |
| `search` | ≤100 chars; LIKE wildcards escaped before Prisma |
| `page`/`limit` | page ≥ 1, limit 1–50 (default 20) |

Unknown view/sort/direction values are `400`s. Completing a task sets `completed_at`; reopening (status `TODO`) clears it.

## View semantics

| View | Window (user timezone) | Default statuses |
| --- | --- | --- |
| `today` | due within today | `TODO`, `IN_PROGRESS` |
| `upcoming` | due after today | `TODO`, `IN_PROGRESS` |
| `overdue` | due before today | `TODO`, `IN_PROGRESS` |
| `completed` | any | `COMPLETED` |
| `all` (default) | any | all |

An explicit `status` filter always wins over the view's default status set. Sorting: `due` (soonest first by default, nulls last), `priority` (most urgent first), `created` (newest first); `dir=asc|desc` overrides.

## Security summary

- Session auth + active-household check on every route (`requireAuth`, `requireHousehold`).
- All ids are resolved **inside** the household; assignees/categories are membership-checked before writes.
- All input validated server-side; user content rendered with `textContent` only (no HTML injection).
- Rate limit: `tasks-write` 60/min (limiter state resettable for tests).
- Series materialization is idempotent per call and bounded (365 rows/series, 24 passes/call) so a crafted rule cannot exhaust the database.

## Testing

`tests/tasks.test.js` (14 tests) covers: 401/403, cross-household 404s and list emptiness, create defaults + date-only storage, per-field validation, CRUD/complete/reopen, category CRUD with duplicate `409` and safe deletion, member-only assignment, view windows, combined filters/search/sort/pagination, rolling-window materialization (bounded, no duplicates), weekly weekdays + end date, head rescheduling, occurrence completion and cascade deletion. Client flows are verified with a Playwright script (list → complete → create → calendar → dashboard, overflow checks at 1360/820/375 px).
