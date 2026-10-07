# Diary module

The diary is the first complete feature module (Phase 4) and the template every later module follows: validator → repository → service → controller → routes, household-scoped queries, standard envelopes, tests beside the rest of the suite. This document records the design decisions; the endpoint tables live in [api-design.md](api-design.md), the tables in [database-design.md](database-design.md).

## Scope

- Personal journal entries: date, day-part, title, content, optional mood, tags and photo attachments.
- Timeline browsing with search, date-range, mood and tag filters, and pagination.
- A dashboard that summarizes the diary and reports future modules as `not_available` — the client never invents data.

Out of scope (later phases): tasks, calendar, meals, finance, family, AI.

## Personal scope model

Every entry is private to its author **inside** a household:

```text
entry visibility = { household_id, user_id }  (both from the session, never from the client)
```

- Another household member requesting the entry gets `404` (no existence leak), not `403`.
- Switching households hides entries written in the previous household; they reappear after switching back.
- Writing requires an active household: `401` without a session, `403` without one.

## Timeline and ordering

Entries are ordered `entry_date DESC, time_of_day ASC, created_at ASC` and grouped for display:

1. **Date header** — long-form local date ("Wednesday, October 7, 2026").
2. **Day-part slot** — `MORNING` / `AFTERNOON` / `EVENING`; `timeOfDay` is an explicit column with a server default of `EVENING` (the form suggests a slot from the user's clock and defaults the date to today in local time — never UTC slicing).

List items carry an `excerpt` (whitespace collapsed, 160 chars + ellipsis) and `attachmentCount`; full `content` is only loaded by the detail endpoint so the timeline stays cheap.

## Validation rules

Enforced server-side in `diaryValidators` (client checks are UX only):

| Field | Rule |
| --- | --- |
| `title` | 1–200 chars after trim; control characters stripped |
| `content` | 1–20,000 chars; C0/C1 control chars removed, tab/newline kept; `\r\n` normalized |
| `entryDate` | Calendar-valid `YYYY-MM-DD`, 1900–2100 |
| `mood` | Must exist in the seeded catalog (`400` otherwise), create/update/list-filter alike |
| `timeOfDay` | `MORNING` \| `AFTERNOON` \| `EVENING` |
| `tags` | ≤10 tags, each 1–40 chars; trimmed, lowercased, deduplicated preserving input order |
| `search` | ≤100 chars; SQL LIKE wildcards (`%`, `_`, `\`) escaped before Prisma |
| `page`/`limit` | page ≥1, limit 1–50 (default 20) |

## Attachments

Design constraint: no new dependencies — the upload flow does not use multipart/multer.

- **Transport:** `POST /api/diary/:id/attachments` receives a **raw binary body** (`express.raw`, 5 MB limit) with the display filename percent-encoded in the `X-Filename` header and the real type in `Content-Type`. CSRF works unchanged because the double-submit token is a header.
- **Type detection:** only magic bytes decide the type — JPEG `FF D8 FF`, PNG `89 50 4E 47`, GIF `GIF87a`/`GIF89a`, WebP `RIFF….WEBP`. A mismatched `Content-Type` is corrected; anything else is `400`. Executables are rejected regardless of the header.
- **Storage:** `app/uploads/diary/<32 hex chars>.<ext>` — `stored_name` comes from `randomBytes(16)`, the extension is validated against a strict allowlist before any path is built, and the original name is sanitized (`../`, separators, control chars removed) purely for display/download. Max 5 attachments per entry.
- **Serving:** never static. `GET …/attachments/:id` re-checks ownership and streams the file with `X-Content-Type-Options: nosniff` and `Cache-Control: private, max-age=3600`; `?download=1` switches to `Content-Disposition: attachment`.
- **Cleanup:** deleting an attachment or an entry unlinks the physical file (`entryId` deletion cascades rows first, then removes files best-effort).
- **Persistence:** the directory is a Docker named volume (`uploads_data`), so files survive container rebuilds; local runs keep them in gitignored `app/uploads/`.

Oversized raw bodies surface as `413` via the central error handler (`entity.too.large`).

## Dashboard contract

`GET /api/dashboard` returns one object with fixed sections:

```jsonc
{
  "user": { "id", "name", "email", "emailVerified", "timezone" },
  "household": { "id", "name", "role", "memberCount" } | null,   // null → 403 on the endpoint
  "diary": { "status": "available" | "empty", "count", "recent": [ …5 items, no content… ] },
  "tasks":     { "status": "not_available" },   // same shape for calendar, meals,
  "calendar":  { "status": "not_available" },   //   shopping, inventory, finance
  …
}
```

`status` is an explicit product signal: `available` (data shown), `empty` (module works, no rows yet), `not_available` (module not built). The dashboard UI renders each case accordingly — the Phase 3 mock preview was deleted rather than kept as a fallback.

## Security summary

- Session auth + active-household check on every route; personal scope re-asserted inside update transactions (ownership re-checked before write).
- All input validated server-side; user content rendered with `textContent` only (no HTML injection).
- Rate limits: `diary-write` 30/min, `diary-upload` 15/min (limiter state resettable for tests).
- `stored_name` never leaves the server; responses expose only `id`, `originalName`, `mimeType`, `sizeBytes`, `url`.

## Testing

`tests/diary.test.js` + `tests/dashboard.test.js` (26 tests) cover: create/update/delete validation, unicode preservation (control chars stripped, accents/emoji kept), search incl. LIKE wildcards, combined date/mood/tag filters with pagination, tag/mood catalog scoping, 401/403, cross-user and cross-household 404s, household-switch binding, attachment accept/reject/413/limit-5/isolation/file-removal, and the dashboard contract (shape, empty state, no content leak). Browser flows are verified separately with Playwright scripts (full diary journey, six-width overflow checks).
