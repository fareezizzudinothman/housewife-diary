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

Response `data`: `{ user, household, diary, tasks, calendar, meals, shopping, inventory, finance }`. Each implemented module reports `status: 'available'` with its own summary or `status: 'empty'`:

- `diary`: `count` + `recent` (five content-free items).
- `tasks`: `openCount`, `dueTodayCount` + `recent` (five open tasks).
- `calendar`: `upcomingCount` (next 7 days) + `next` (up to three events inside that window).

The four future modules (`meals`, `shopping`, `inventory`, `finance`) always return `status: 'not_available'`.

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

## Planned endpoint map (future phases)

| Phase | Base path | Endpoints (representative) |
| --- | --- | --- |
| 6 | `/api/meals`, `/api/recipes` | meal plans, recipes with ingredients, favorites |
| 6 | `/api/shopping`, `/api/inventory` | lists/items/purchase, items/transactions/low-stock |
| 7 | `/api/expenses`, `/api/bills`, `/api/budgets` | CRUD, monthly report, spending analysis |
| 8 | `/api/family`, `/api/home`, `/api/documents`, `/api/notes` | module CRUD |
| 9 | `/api/notifications` | list, read, preferences; backup/export endpoints |
| 10 | `/api/ai` | conversations, messages, tool-grounded responses |

## Versioning

No URL versioning yet — the product is pre-release and single-tenant-per-deployment. If breaking changes become necessary after real users exist, introduce `/api/v2` alongside rather than mutating the current contract.
