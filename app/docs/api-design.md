# API design

REST over HTTP, JSON only, mounted under `/api`. All endpoints follow the conventions below — deviations are architectural bugs.

## Conventions

- **Methods:** `GET` (read), `POST` (create/actions), `PATCH` (partial update), `PUT` (full update where warranted), `DELETE` (remove). No verbs in paths; actions use a sub-resource where necessary (e.g. `POST /api/auth/login`).
- **Auth:** every private route requires an authenticated session (HTTP-only cookie); authorization resolves the active household server-side. Unauthenticated → `401 UNAUTHORIZED`; wrong household/role → `403 FORBIDDEN`; cross-household resource ids → `404 NOT_FOUND` (no existence leaks).
- **Validation:** request bodies/queries validated in `src/server/validators` before controllers act; failures return `400 VALIDATION_ERROR` with per-field `details`.
- **Rate limiting:** applied to auth endpoints (login/register/reset/verification, per IP and per account), then to write endpoints generally.
- **Pagination:** list endpoints (see `/api/diary`) accept `page`/`limit` and return `{ items, page, limit, total }` inside the standard success envelope.
- **Time:** ISO-8601 strings in UTC; dates as `YYYY-MM-DD`.

## Response envelopes

Success:

```json
{ "success": true, "data": { } }
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request.",
    "details": []
  }
}
```

`details` is an array of field/problem objects for validation errors, otherwise empty. `message` is safe to display to users; internals (stacks, SQL) are never leaked (in production the generic 500 message is used).

## Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Malformed/invalid input (incl. invalid JSON bodies) |
| `VALIDATION_ERROR` | 413 | Request body exceeds the route's size limit (e.g. 5 MB uploads) |
| `UNAUTHORIZED` | 401 | Missing/expired session or bad credentials |
| `FORBIDDEN` | 403 | Authenticated but not allowed (role/household) |
| `NOT_FOUND` | 404 | Resource does not exist (also used to avoid leaking existence) |
| `CONFLICT` | 409 | Duplicate resource/state conflict |
| `RATE_LIMITED` | 429 | Too many requests (login throttling, etc.) |
| `DATABASE_ERROR` | 503 | Database unreachable |
| `INTERNAL_ERROR` | 500 | Unexpected failure |

## Health check (implemented — foundation)

`GET /api/health`

- `200` — service and database reachable:

  ```json
  {
    "success": true,
    "data": {
      "status": "ok",
      "service": "housewife-diary",
      "environment": "development",
      "database": "connected",
      "timestamp": "2026-10-07T00:00:00.000Z"
    }
  }
  ```

- `503` — `DATABASE_ERROR` envelope when PostgreSQL is unreachable.
- Used by the Compose healthchecks (`wget` from inside the app container).

## Authentication, user and household endpoints (implemented — Phase 2)

All routes below enforce the double-submit CSRF token on unsafe methods.

### `/api/auth`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/csrf` | — | Issues the `hd_csrf` cookie + token |
| POST | `/register` | — | `201`; auto-login; sends verification mail; rate limited |
| POST | `/login` | — | Rate limited + per-account lockout (`429` + `Retry-After`) |
| POST | `/logout` | session | Revokes the session, clears the cookie |
| GET | `/session` | session | Current user + session + household list |
| POST | `/forgot-password` | — | Uniform `200` whether or not the email exists |
| POST | `/reset-password` | — | Single-use token; revokes all sessions |
| POST | `/change-password` | session | Requires current password; revokes other sessions |
| GET | `/verify-email` | — | Single-use token from the mail |
| POST | `/verify-email/resend` | session | `409` once verified; per-account throttle |
| GET | `/sessions` | session | List active sessions |
| DELETE | `/sessions/other` | session | Revoke all other sessions |
| DELETE | `/sessions/:id` | session | Revoke one session |

### `/api/users`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/me` | session | Profile |
| PATCH | `/me` | session | Name, timezone, active household (`404` if not a member) |

### `/api/households`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/` | session | Creator becomes OWNER; first household becomes active |
| GET | `/` | session | My households with role, member count, `isActive` |
| GET | `/:id` | membership | `404` for non-members |
| POST | `/:id/switch` | membership | Sets `activeHouseholdId` |
| GET | `/:id/members` | membership | Member list |
| POST | `/:id/members` | admin+ | Invite by email; owner-only `ADMIN` role |
| PATCH | `/:id/members/:userId` | admin+ | Role change; owner-only ownership transfer (`OWNER`) |
| DELETE | `/:id/members/:userId` | admin+ | Remove (or self → leave) |
| POST | `/:id/leave` | membership | Owner must transfer first (`409`) |

## Theme endpoints (implemented — Phase 3)

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/themes` | — | Public preset catalog (slug, name, mood, mode, tokens) |
| GET | `/api/themes/me` | session | Resolved appearance: color mode, density, nav style, preset, overrides |
| PATCH | `/api/themes/me` | session | Partial update; empty body returns state without writing |
| DELETE | `/api/themes/me` | session | Reset to defaults; idempotent |

Override validation, the allowlist and the response shapes are specified in [theme-system.md](theme-system.md).

## Dashboard and diary endpoints (implemented — Phase 4)

### `/api/dashboard`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` | session + household | Aggregated overview; `403` when the user has no active household |

Response `data`: `{ user, household, diary, tasks, calendar, meals, shopping, inventory, recipes, finance }`. Each implemented module reports `status: 'available'` with its own summary or `status: 'empty'`:

- `diary`: `count` + `recent` (five content-free items).
- `tasks`: `openCount`, `dueTodayCount` + `recent` (five open tasks).
- `calendar`: `upcomingCount` (next 7 days) + `next` (up to three events inside that window).
- `meals`: `today[]` + `next` (meal summaries with `displayTitle`).
- `shopping`: `activeList` (`id`, `name`, `itemCount`, `remaining`) or `null`.
- `inventory`: `lowStockCount`, `outOfStockCount`, `expiringSoonCount`, `expiredCount` + `alerts` (up to three).
- `recipes`: `count` + `favourites` (up to three `{ id, title }`).
- `finance`: current-month `income`/`expenses`/`net` (primary currency), `budgets` summary, `overdueBillCount` + `upcomingBills` (up to three); `status: 'empty'` until the household records any finance data.

### `/api/diary`

All routes require a session and an active household (`requireHousehold`). Entries are scoped to `{ householdId, userId }` — other members' entries never resolve (`404`).

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/meta` | session + household | Mood catalog + my tag list (registered before `/:id`) |
| GET | `/` | session + household | List: `search`, `from`, `to`, `mood`, `tag`, `page`, `limit` (≤50) → `{ items, page, limit, total, totalPages }` |
| POST | `/` | session + household | `201 { entry }`; rate limited (`diary-write`) |
| GET | `/:id` | session + household | Detail = list shape + `content` + `attachments[]` |
| PATCH | `/:id` | session + household | Partial update; unknown mood/invalid fields → `400` |
| DELETE | `/:id` | session + household | `200 { id, deleted: true }`; cascades tags/attachments and unlinks files |
| POST | `/:id/attachments` | session + household | Raw binary body, `X-Filename` header; `201 { attachment }`; ≤5 per entry, 5 MB, `diary-upload` rate limit |
| GET | `/:id/attachments/:attachmentId` | session + household | Streams bytes (`nosniff`, private cache); `?download=1` forces download |
| DELETE | `/:id/attachments/:attachmentId` | session + household | Removes row and file |

List items carry `excerpt` (whitespace-collapsed, 160 chars) and `attachmentCount`; `content` appears only on the detail endpoint. Ordering is `entryDate DESC, timeOfDay ASC, createdAt ASC`. Request bodies over 5 MB return `413 VALIDATION_ERROR`. Full design: [diary.md](diary.md).

## Tasks and calendar endpoints (implemented — Phase 5)

Both modules require a session and an active household (`requireHousehold`); every id resolves inside the active household only (`404` across households).

### `/api/tasks`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/meta` | session + household | Category options + household members (for assignment) |
| GET | `/categories` | session + household | Categories with task counts |
| POST | `/categories` | session + household | `201 { category }`; duplicate name → `409`; rate limited (`tasks-write`) |
| DELETE | `/categories/:id` | session + household | `200 { id, deleted: true }`; tasks keep existing with no category |
| GET | `/` | session + household | List: `view`, `status`, `priority`, `category`, `assignee`, `search`, `sort`, `dir`, `page`, `limit` (≤50) → `{ items, page, limit, total, totalPages }` |
| POST | `/` | session + household | `201 { task }`; a recurrence rule creates the series head and its first materialized window |
| GET | `/:id` | session + household | Detail (same shape as list items) |
| PATCH | `/:id` | session + household | Partial update; changing a head's due date/rule regenerates open occurrences |
| POST | `/:id/complete` | session + household | Sets `COMPLETED` + `completedAt` |
| DELETE | `/:id` | session + household | Deletes the task; deleting a series head cascades its occurrences. `?series=true` on an occurrence deletes the whole series |

`view` ∈ `today \| upcoming \| overdue \| completed \| all` (default `all`); `sort` ∈ `due \| priority \| created`; `dir` ∈ `asc \| desc` (defaults: due → asc, otherwise desc). List items carry `recurrence`, `seriesId`, `repeating`, `category`, `assignee` and `createdBy`. Full design: [tasks.md](tasks.md).

### `/api/calendar`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` | session + household | Ranged read: `from`/`to` (`YYYY-MM-DD`, user-timezone days; missing bounds default to the current month, max 366 days) → `{ events, from, to }`, sorted by `startAt` |
| POST | `/` | session + household | `201 { event }`; rate limited (`calendar-write`) |
| GET | `/:id` | session + household | Native event detail (`404` for derived `task:` ids) |
| PATCH | `/:id` | session + household | Partial update; all-day ↔ timed conversion keeps wall-clock days |
| DELETE | `/:id` | session + household | `200 { id, deleted: true }` |

Range responses mix native events (`sourceType: MANUAL`), recurring expansions (`recurring: true`), and read-only task-derived items (`sourceType: TASK`, id `task:<taskId>`). Full design: [calendar.md](calendar.md).

## Recipes, meals, shopping and inventory endpoints (implemented — Phase 6)

All four modules require a session and an active household (`requireHousehold`); every id resolves inside the active household only (`404` across households). Shared kitchen vocabulary (meal types, item categories, inventory locations, units, decimals) lives in `validators/kitchen.js`.

### `/api/recipes`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/meta` | session + household | Distinct categories in use (registered before `/:id`) |
| GET | `/` | session + household | List: `search`, `category`, `favourite`, `sort` ∈ `updated\|created\|title`, `page`, `limit` (≤50) |
| POST | `/` | session + household | `201 { recipe }`; structured `ingredients[]`; rate limited (`recipes-write`) |
| GET | `/:id` | session + household | Detail with ordered ingredients + `createdBy` |
| PATCH | `/:id` | session + household | Partial; supplying `ingredients` replaces the list, `[]` clears it |
| DELETE | `/:id` | session + household | `200 { id, deleted: true }`; planned meals keep the title as a snapshot |
| POST | `/:id/favourite` | session + household | Sets the favourite flag |
| DELETE | `/:id/favourite` | session + household | Clears the favourite flag |
| POST | `/:id/duplicate` | session + household | `201 { recipe }`; optional `{ title }`; ingredients copied |

Full design: [recipes.md](recipes.md).

### `/api/meals`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/shopping-plan` | session + household | Read-only aggregation of planned recipe ingredients (`from`/`to`, same range rules) |
| GET | `/` | session + household | Range read: `from`/`to` (default current Monday–Sunday week, max 90 days), `mealType`; sorted by date then slot |
| POST | `/` | session + household | `201 { meal }`; requires `recipeId` or `title`; rate limited (`meals-write`) |
| GET | `/:id` | session + household | Detail with `displayTitle` and resolved `recipe` |
| PATCH | `/:id` | session + household | Partial; must keep at least one of `recipeId`/`title` |
| DELETE | `/:id` | session + household | `200 { id, deleted: true }` |

Meals also surface through `GET /api/calendar` as derived all-day items (`sourceType: MEAL`, id `meal:<entryId>`). Full design: [meals.md](meals.md).

### `/api/shopping-lists`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` | session + household | List: `search`, `archived`, `page`, `limit` (≤50) |
| POST | `/` | session + household | `201 { list }`; rate limited (`shopping-write`) |
| GET | `/:id/items` | session + household | Items: `search`, `purchased`, `category`, `page`, `limit` (≤200) |
| POST | `/:id/items` | session + household | `201 { item }` |
| PATCH | `/:id/items/:itemId` | session + household | Partial; `purchased` toggle stamps/clears `purchasedAt` |
| DELETE | `/:id/items/:itemId` | session + household | `200 { id, deleted: true }` |
| POST | `/:id/items/:itemId/to-inventory` | session + household | `201 { item, inventoryItem, merged }`; records a `PURCHASE` and marks the line bought |
| POST | `/:id/from-recipe/:recipeId` | session + household | `201 { list, added, merged, items }`; optional `{ servings }` scales quantities |
| POST | `/:id/from-meals` | session + household | `201 { list, added, merged }`; `{ from, to, items? }` commits the reviewed selection or the live plan |
| GET | `/:id` | session + household | List detail with `itemCount` + `remaining` |
| PATCH | `/:id` | session + household | Rename/notes/archive |
| DELETE | `/:id` | session + household | `200 { id, deleted: true }`; items cascade |

Full design: [shopping.md](shopping.md).

### `/api/inventory`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` | session + household | List: `search`, `category`, `location`, `stock`, `expiry`, `page`, `limit` (≤50) |
| POST | `/` | session + household | `201 { item }`; opening `quantity > 0` records a `PURCHASE`; rate limited (`inventory-write`) |
| GET | `/:id` | session + household | Detail with derived `status`/`expiryStatus` |
| PATCH | `/:id` | session + household | Metadata only — `quantity` is rejected |
| DELETE | `/:id` | session + household | `200 { id, deleted: true }`; ledger cascades |
| POST | `/:id/consume` | session + household | `200 { item, transaction }`; `CONSUME`, rejects negative stock |
| POST | `/:id/waste` | session + household | `200 { item, transaction }`; `WASTE` |
| POST | `/:id/add-stock` | session + household | `200 { item, transaction }`; `PURCHASE` |
| POST | `/:id/adjust` | session + household | `200 { item, transaction }`; `ADJUST` sets the absolute value |
| GET | `/:id/transactions` | session + household | Ledger, newest first, `page`/`limit` (≤100) |

Full design: [inventory.md](inventory.md).

## Finance endpoints (implemented — Phase 7)

All routes require a session and an active household (`requireHousehold`); every id resolves inside the active household only (`404` across households). Money fields are two-decimal **strings**. Writes are rate limited (`finance-write` 80/min, receipts `finance-upload` 15/min). Mounted at `/api/finance`.

### `/api/finance/meta`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/meta` | session + household | Currencies, default currency, today, accounts, categories (materializes due recurring first) |

### `/api/finance/accounts` and `/api/finance/categories`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/accounts` | session + household | List with **derived balance** (`movement` per account); `includeArchived`, `page`, `limit` |
| POST | `/accounts` | session + household | `201 { account }`; ≤50 per household; rate limited |
| GET | `/accounts/:id` | session + household | Detail |
| PATCH | `/accounts/:id` | session + household | Name (duplicate → `409`), type, `openingBalance`, `active`; currency change → `409` once transactions exist |
| POST | `/accounts/:id/archive` | session + household | Deactivates — history keeps the reference |
| GET | `/categories` | session + household | Global seeds + household rows with `scope`, `active`, `transactionCount`; filters `type`, `includeArchived` |
| POST | `/categories` | session + household | `201 { category }`; duplicate name → `409`; ≤100 per household |
| PATCH | `/categories/:id` | session + household | Household rows; global seeds → `403` |
| POST | `/categories/:id/archive` | session + household | Deactivates (never deletes referenced rows) |

### `/api/finance/transactions`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` | session + household | List: `type`, `status` (`POSTED` default / `VOIDED` / `ALL`), `categoryId`, `accountId` (either side of a transfer), `sourceType`, `from`, `to`, `search`, `page`, `limit` (≤50) |
| POST | `/` | session + household | `201 { transaction }`; `EXPENSE`/`INCOME`/`TRANSFER`; transfers need equal-currency accounts and no category |
| GET | `/:id` | session + household | Detail with resolved category/account/createdBy |
| PATCH | `/:id` | session + household | Metadata only — changing money fields → `400` with void guidance |
| POST | `/:id/void` | session + household | `{ reason }`; one-way `VOIDED`; reopens a bill if this paid one |
| POST | `/:id/receipt` | session + household | Raw binary, `X-Filename`; JPEG/PNG/WebP/PDF by magic bytes, ≤5 MB; `201 { receipt }` |
| GET | `/:id/receipt` | session + household | Private byte stream (`nosniff`) |
| DELETE | `/:id/receipt` | session + household | Removes row and file |

Full designs: [finance-transactions.md](finance-transactions.md), [finance.md](finance.md).

### `/api/finance/budgets`, `/api/finance/bills`, `/api/finance/recurring`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/budgets` | session + household | `year`, `month`, `categoryId`, `page`, `limit` (≤100); items carry live `spent`/`percentUsed`/`overBudget` |
| POST | `/budgets` | session + household | `201 { budget }` with derived spend; duplicate month/category → `409` |
| GET/PATCH/DELETE | `/budgets/:id` | session + household | Detail / update `amount`+`notes` (re-derives spend; category/currency/period immutable) / delete (plan only) |
| GET | `/bills` | session + household | `status` ∈ `UPCOMING\|DUE\|OVERDUE\|PAID\|CANCELLED\|ALL` (DUE/OVERDUE derived), `categoryId`, `search`, `page`, `limit` |
| POST | `/bills` | session + household | `201 { bill }` with derived `status` |
| GET/PATCH | `/bills/:id` | session + household | Unpaid bills are editable; paid → `409` |
| POST | `/bills/:id/pay` | session + household | `201 { bill, transaction }`; atomic — duplicate → `409` |
| POST | `/bills/:id/cancel` | session + household | Final for unpaid bills |
| GET | `/recurring` | session + household | Rules with `generatedCount`, `nextOccurrence`; `active`, `type` filters |
| POST | `/recurring` | session + household | `201 { recurring }`; `DAILY\|WEEKLY\|MONTHLY\|YEARLY` + `interval` 1–99 |
| GET/PATCH | `/recurring/:id` | session + household | Detail / edit schedule or amounts |
| POST | `/recurring/:id/pause` \| `/resume` | session + household | Stops/continues materialization (cursor preserved) |

Full designs: [finance-budgets.md](finance-budgets.md), [finance-bills.md](finance-bills.md), [finance.md](finance.md).

### `/api/finance/reports`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/reports/monthly` | session + household | `year`, `month`, `currency` → income/expenses/net, category breakdowns, budgets, bills, derived account balances |

Bills also surface through `GET /api/calendar` as derived `sourceType: BILL` items (see [calendar.md](calendar.md)). Full design: [finance-reports.md](finance-reports.md).

## Planned endpoint map (future phases)

| Phase | Base path | Endpoints (representative) |
| --- | --- | --- |
| 8 | `/api/family`, `/api/home`, `/api/documents`, `/api/notes` | module CRUD |
| 9 | `/api/notifications` | list, read, preferences; backup/export endpoints |
| 10 | `/api/ai` | conversations, messages, tool-grounded responses |

Phases 6 and 7 endpoints (`/api/recipes`, `/api/meals`, `/api/shopping-lists`, `/api/inventory`, `/api/finance/*`) are documented above.

## Versioning

No URL versioning yet — the product is pre-release and single-tenant-per-deployment. If breaking changes become necessary after real users exist, introduce `/api/v2` alongside rather than mutating the current contract.
