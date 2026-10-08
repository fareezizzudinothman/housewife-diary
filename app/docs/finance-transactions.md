# Finance transactions

The shared ledger. Every income, expense and transfer is one row in `financial_transactions` — see [finance.md](finance.md) for the model and money rules; this document covers the transaction surface itself.

## Creating movements

`POST /api/finance/transactions`

| Field | Rules |
| --- | --- |
| `type` | `EXPENSE`, `INCOME`, `TRANSFER` |
| `amount` | decimal string, `> 0`, ≤ 2 decimals, within `±999999999999.99` — stored as a positive magnitude |
| `currency` | allowlisted, default `SGD`; must match the account's currency |
| `accountId` | required; household account |
| `counterAccountId` | **required for `TRANSFER`**, forbidden otherwise; must be a different account with the **same currency** |
| `categoryId` | required for `EXPENSE`/`INCOME` (type must match); forbidden for `TRANSFER` |
| `transactionDate` | `YYYY-MM-DD`, defaults to today (session timezone) |
| `description`, `merchant`, `notes` | optional, length-capped |

`201 { transaction }` with resolved `category`, `account`, `counterAccount` and `createdBy`. Rows created through bill payment carry `sourceType: BILL`, generated rows carry `sourceType: RECURRING` with `sourceId` → rule id.

## Updating and voiding

- `PATCH /transactions/:id` edits **metadata only**: `description`, `merchant`, `notes`, `categoryId`, `transactionDate`. Attempting to change `amount`, `currency`, `type`, `accountId`, `counterAccountId` or `status` is rejected with `400` and a message pointing at the correct path (void + re-create) — the API never rewrites history.
- `POST /transactions/:id/void` with `{ reason }` (≤ 300 chars) moves `POSTED → VOIDED`. One-way: a voided row cannot return, cannot be edited, and drops out of all totals, balances, budgets and reports while remaining visible with `status=ALL`.
- Voiding the expense that paid a bill reopens the bill (see [finance-bills.md](finance-bills.md)) — the correction path is void → pay again, never edit-the-payment.

## Listing, search and filters

`GET /api/finance/transactions`

| Parameter | Meaning |
| --- | --- |
| `type` | `EXPENSE` \| `INCOME` \| `TRANSFER` |
| `status` | `POSTED` (default) \| `VOIDED` \| `ALL` |
| `categoryId` | exact category |
| `accountId` | matches **either side** of a transfer |
| `sourceType` | `MANUAL` \| `BILL` \| `RECURRING` |
| `from`, `to` | `transactionDate` range (`YYYY-MM-DD`, inclusive) |
| `search` | case-insensitive substring of description/merchant (≤ 100 chars) |
| `page`, `limit` | ≤ 50 per page |

Response: `{ items, page, limit, total, totalPages }` inside the standard envelope, newest date first. List items embed `category`, `account`, `counterAccount` and `createdBy` so the page needs no follow-up requests.

## Integrity

- Transfers never touch income/expense totals — reports and budgets filter `type`, so a transfer can never inflate spending.
- `account` filter uses `OR (accountId, counterAccountId)`, combined safely with `search` via `AND`.
- Isolation: every query is `{ householdId }` from the session; another household's transaction id resolves to `404` on read, patch and void.

Tests: `tests/finance-transactions.test.js` (12) — validation matrix, decimal exactness, filters/pagination, immutability of money fields, void semantics and cross-household isolation.
