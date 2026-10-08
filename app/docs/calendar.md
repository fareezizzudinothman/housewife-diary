# Calendar module

Household calendar with native events and a read-only view over other modules' dated items (Phase 5). Native events follow the usual layering: `calendarValidators` → `calendarRepository` → `calendarService` → `calendarController` → `calendar.routes`. Endpoint tables live in [api-design.md](api-design.md); tables in [database-design.md](database-design.md).

## Scope

- Native event CRUD: title, notes, all-day or timed start/end, category, location, reminder settings and a simple recurrence rule.
- Ranged queries: one endpoint returns everything visible in a date range, expanded in memory.
- **Cross-module derived items:** tasks with a due date (`sourceType: "TASK"`), planned meals (`"MEAL"`) and unpaid bills due in range (`"BILL"`) appear as read-only calendar items — never persisted as event rows.
- Month grid client with day selection and a compact day panel.

Out of scope (later phases): notifications/reminder delivery, external calendar sync, birthdays/family/maintenance sources (the `sourceType` enum remains the extension point).

## Source abstraction

```text
event visibility = { household_id }  (resolved from the session, never the client)

source_type: MANUAL | TASK | DIARY | BILL | FAMILY | MAINTENANCE | MEAL | SHOPPING | APPOINTMENT
```

- Native events are stored with `source_type = MANUAL` and `source_id = NULL`.
- Derived items are **computed at query time** and never stored — currently `TASK` (tasks with `due_at` inside the range, status not `CANCELLED`), `MEAL` (planned meals in range, nominal slot hour) and `BILL` (unpaid bills whose due date falls inside the range, all-day; paid/cancelled bills disappear). Their ids are namespaced (`task:<taskId>`, `meal:<entryId>`, `bill:<billId>`) so they can never collide with a real event id; fetching such an id from `/api/calendar/:id` returns `404`.
- `DIARY`, `FAMILY`, `MAINTENANCE`, `SHOPPING`, `APPOINTMENT` etc. are reserved for later phases and remain unpersisted by design.

## Data model

```text
calendar_events   id, household_id (FK, cascade), created_by_id (FK users),
                  title, description, start_at, end_at, all_day,
                  category (GENERAL|FAMILY|HOME|HEALTH|WORK|OTHER), location,
                  recurrence (jsonb rule | null), reminder_offset_minutes, reminder_enabled,
                  source_type (MANUAL…), source_id, created_at, updated_at
```

- Timed events store exact UTC instants; **all-day** events store the UTC midnight of their local (start/end) calendar days. `end_at >= start_at` always holds; a single-day all-day event has `start_at = end_at`.
- Reminder fields are **stored foundation only**: `reminder_offset_minutes` (0–40,320) + `reminder_enabled`. Delivery arrives in Phase 9 ([implementation-plan.md](implementation-plan.md)).
- `recurrence` has the same shape as tasks and is expanded in memory per query — recurring heads are never materialized.
- Indexes: `(household_id, start_at)`, `(household_id, end_at)`, `(household_id, source_type)`, `(household_id, source_id)`.

## Ranged queries

`GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`

- Bounds are interpreted as **local calendar days in the user's timezone** (`users.timezone`, default UTC) and converted to an instant window.
- Missing bounds default to the current local month; `from` alone extends to the end of that month, `to` alone starts at the beginning of that month.
- Non-recurring events overlap the window when `start_at <= end-of-range` and `end_at > start-of-range` (half-open, so an event ending exactly at local midnight belongs to the previous day only).
- Recurring events are expanded within the window; each instance preserves the original duration and reports `recurring: true` with the series `id`.
- Task items are included when their `due_at` falls inside the window; date-only tasks are reported with `allDay: true` (end-of-local-day convention from [tasks.md](tasks.md)). Meal items use their slot's nominal hour (`allDay: true`); bill items are all-day on the due date with a `bill` detail block ([finance-bills.md](finance-bills.md)).
- The whole response is sorted by `startAt`, then title. Ranges are capped at **366 days** (`400` beyond) to keep expansion bounded.
- `to < from` is a `400`.

## Validation rules

Enforced server-side in `calendarValidators`:

| Field | Rule |
| --- | --- |
| `title` | 1–200 chars after trim; single-line |
| `description` | ≤5,000 chars; newlines kept, control chars removed |
| `start` | all-day: `YYYY-MM-DD` (1900–2100); timed: ISO instant with explicit offset |
| `end` | optional (defaults to `start`); same format as `start`; may not precede it |
| `allDay` | boolean (default `false`) |
| `category` | `GENERAL` \| `FAMILY` \| `HOME` \| `HEALTH` \| `WORK` \| `OTHER` |
| `location` | ≤200 chars; single-line |
| `reminder` | `{ offsetMinutes: 0–40320, enabled?: boolean }` or `null` to clear |
| `recurrence` | as tasks; `endDate` ≥ the series anchor date |

Updates are partial. Changing kind without new dates re-anchors the stored instants: to all-day → UTC midnights of the same local days; to timed → local start-of-day/end-of-day. Moving only the start of a timed event preserves its duration.

## Security summary

- Session auth + active-household check on every route; cross-household ids return `404`.
- Day-boundary math happens server-side from the session timezone — clients cannot widen another household's data.
- Response range is capped and recurrence expansion is limited (≤500 instances per event per query) so a crafted rule cannot stall the server.
- All input validated server-side; user content rendered with `textContent` only.
- Rate limit: `calendar-write` 60/min (limiter state resettable for tests).

## Testing

`tests/calendar.test.js` (10 tests) covers: 401/403, cross-household 404s, timed create + reminder shape, per-field validation (missing title/start, inverted/mismatched bounds, bad category/reminder), all-day single/multi-day events and impossible dates, partial updates with duration preservation and all-day toggling, range queries (overlap, from-only default, inverted/too-long/invalid dates), recurring expansion with end dates, task-derived items (all-day and timed, cancelled excluded), and timezone-aware day boundaries on a UTC+7 user. Bill-derived items are covered in `tests/finance-bills.test.js` (derived `BILL` entries, paid/cancelled excluded, `bill:` id → 404, cross-household empty). Client flows are verified with a Playwright script (month view, day selection, event create, overflow checks at 1360/820/375 px).
