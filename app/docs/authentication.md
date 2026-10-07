# Authentication (Phase 2)

Status: **implemented**. This document is the design reference for the code in `src/server/` (services, middleware, validators) and the tests in `tests/`.

## Approach

Server-side sessions with HTTP-only cookies, stored in PostgreSQL (`sessions` table). Chosen over stateless tokens because the product needs: real logout and revocation, remember-me, session listing/expiry, and CSRF control — all natural with server state and awkward with pure JWTs.

## Flows

| Flow | Design |
| --- | --- |
| Register | Validate name/email/password → create user (unverified) → send verification email → auto-login with short session |
| Login | Rate-limited; bcrypt verify → create session cookie (HTTP-only, Secure in production, SameSite=Lax) |
| Logout | Delete session server-side + clear cookie (no stale revocation windows) |
| Remember me | Longer session TTL (e.g. 30 days vs 1 day), sliding renewal with a cap |
| Forgot password | Single-use, hashed, TTL-bound reset token (never stored raw, never logged) |
| Reset password | Consume token → update hash → revoke all existing sessions |
| Change password | Requires current password; revokes other sessions |
| Email verification | Hashed, TTL-bound verification token; resend with throttle |
| Session management | List active sessions (device/IP/date), revoke individual or all |
| Profile | Update name, timezone, active household, preferences |

## Password policy

- Hashing: bcrypt, cost 12.
- Minimum 10 characters, checked against a small common-password denylist; no artificial composition rules.
- Passwords are never logged, never returned by any endpoint.

## Middleware chain

```text
helmet → express.json → parseCookies → CSRF (unsafe /api methods) → route
  → validators + rate limiters (per route) → requireAuth → requireHousehold → handler
```

- `requireAuth`: validates session cookie → loads user → `req.user`; `401` otherwise.
- `requireHousehold(role?)`: resolves the user's active household membership → `req.householdId` + `req.householdRole`; `401` without a user, `403` without a valid active membership (or insufficient role). All module services take `req.householdId` as their scoping key.
- All private application modules are mounted behind these middlewares.

## Security controls

| Control | Design |
| --- | --- |
| Rate limiting | Per IP + per account on login/register/reset; temporary lockout with `429 RATE_LIMITED` |
| CSRF | SameSite=Lax cookies + double-submit token for unsafe methods (state-changing requests must be same-origin) |
| Cookies | `httpOnly`, `secure` (production), `sameSite=lax`, path-scoped |
| Enumeration | Uniform messages/timings for unknown email vs wrong password |
| Audit | Auth events (login success/failure, password change, session revocation) logged |
| Secrets | `SESSION_SECRET` from environment (`app/.env.example` placeholder already reserved); missing secret fails startup in production |

## Household management (same phase)

- Creating a household makes the creator OWNER (`households.owner_user_id` + `household_members` row).
- Members are invited by email (admin action), roles: OWNER, ADMIN, MEMBER, VIEWER.
- Owners/admins manage members; owners can transfer ownership; members can leave (owner cannot leave without transfer).
- Data isolation: every service query is scoped by `req.householdId`; cross-household IDs return `404`, never `403`, to avoid leaking existence.

## Test coverage (phase completion — met)

- Register/login/logout happy paths and failure cases (invalid credentials, unknown user, expired session) — `tests/auth.test.js`.
- Cookie flags verified; session revoked after logout and password change — `tests/auth.test.js`, `tests/password.test.js`.
- Rate limiting and lockout return `RATE_LIMITED` with `Retry-After` — `tests/auth.test.js`.
- Password hashing (cost 12, salted), policy, reset/verification token flows — `tests/password.test.js`.
- Household isolation: user A cannot read/modify household B's data (404s) — `tests/households.test.js`.
- Role matrix: viewer read-only; member cannot manage members; admin can; owner can transfer — `tests/households.test.js`.
- `requireHousehold` unit-tested directly (401/403 paths, stale membership) — `tests/households.test.js`.
