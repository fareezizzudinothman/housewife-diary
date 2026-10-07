# API design

REST over HTTP, JSON only, mounted under `/api`. All endpoints follow the conventions below — deviations are architectural bugs.

## Conventions

- **Methods:** `GET` (read), `POST` (create/actions), `PATCH` (partial update), `PUT` (full update where warranted), `DELETE` (remove). No verbs in paths; actions use a sub-resource where necessary (e.g. `POST /api/auth/login`).
- **Auth:** every private route requires an authenticated session (HTTP-only cookie); authorization resolves the active household server-side. Unauthenticated → `401 UNAUTHORIZED`; wrong household/role → `403 FORBIDDEN`; cross-household resource ids → `404 NOT_FOUND` (no existence leaks).
- **Validation:** request bodies/queries validated in `src/server/validators` before controllers act; failures return `400 VALIDATION_ERROR` with per-field `details`.
- **Rate limiting:** applied to auth endpoints (login/register/reset/verification, per IP and per account), then to write endpoints generally.
- **Pagination:** list endpoints (from Phase 4) accept `page`/`limit` and return `{ items, page, limit, total }` inside the standard success envelope.
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

## Planned endpoint map (per phase)

| Phase | Base path | Endpoints (representative) |
| --- | --- | --- |
| 2 | `/api/auth` | register, login, logout, forgot-password, reset-password, change-password, verify-email, session |
| 2 | `/api/users` | me, update profile, preferences |
| 2 | `/api/households` | create, list mine, switch active, members add/remove/role, leave |
| 3 | `/api/themes` | presets, get/put my theme + customization |
| 4 | `/api/dashboard` | daily overview aggregate |
| 4 | `/api/diary` | entries CRUD, search, tags, attachments, mood |
| 5 | `/api/tasks` | tasks CRUD, complete, categories, templates, recurrences |
| 5 | `/api/calendar` | events CRUD, ranged queries |
| 6 | `/api/meals`, `/api/recipes` | meal plans, recipes with ingredients, favorites |
| 6 | `/api/shopping`, `/api/inventory` | lists/items/purchase, items/transactions/low-stock |
| 7 | `/api/expenses`, `/api/bills`, `/api/budgets` | CRUD, monthly report, spending analysis |
| 8 | `/api/family`, `/api/home`, `/api/documents`, `/api/notes` | module CRUD |
| 9 | `/api/notifications` | list, read, preferences; backup/export endpoints |
| 10 | `/api/ai` | conversations, messages, tool-grounded responses |

## Versioning

No URL versioning yet — the product is pre-release and single-tenant-per-deployment. If breaking changes become necessary after real users exist, introduce `/api/v2` alongside rather than mutating the current contract.
