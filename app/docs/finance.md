# Finance module

Household money management: accounts, categories, a single shared ledger of income/expense/transfer transactions, monthly budgets, bills with atomic payment, bounded recurring transactions, private receipts, monthly reports and the dashboard finance summary.

## Scope

- **Accounts** — where money lives (cash, bank, credit card, e-wallet), one currency each.
- **Categories** — classification of money movement (`INCOME` | `EXPENSE`); global seeds + household rows.
- **Transactions** — the ledger: `EXPENSE`, `INCOME` and `TRANSFER` rows in one table.
- **Budgets** — monthly spending targets per expense category.
- **Bills** — obligations with a due date; paying one creates the matching ledger expense atomically.
- **Recurring transactions** — structured rules that materialize ledger rows as they come due.
- **Receipts** — one private file per transaction (evidence/document).
- **Reports** — `GET /api/finance/reports/monthly` and the dashboard `finance` section.

Bills, budgets, recurring rules and receipts are *not* transactions — they reference or produce them. Keeping the concepts separate is what makes the ledger trustworthy.

## Ledger model

One table (`financial_transactions`) holds every movement:

| Type | Meaning | `accountId` | `counterAccountId` | Category |
| --- | --- | --- | --- | --- |
| `EXPENSE` | money out | paying account | `null` | required (expense) |
| `INCOME` | money in | receiving account | `null` | required (income) |
| `TRANSFER` | money between own accounts | source | destination | `null` (never categorized) |

- Amounts are **always positive magnitudes**; direction comes from `type`. There is no signed amount and no separate income/expense ledger to reconcile.
- `status` is `POSTED` or `VOIDED`. Void is **one-way**: a voided row keeps its money fields for history and is excluded from every total; voiding the expense that paid a bill reopens the bill (`paidAt`/`paidTransactionId` cleared) so it can be paid again.
- `sourceType` records how the row appeared: `MANUAL`, `BILL` (payment) or `RECURRING` (generation), with `sourceId` pointing back. Transfers are always `MANUAL`.
- **Immutability:** money fields (type, amount, currency, accounts, `transactionDate`, status) can never be `PATCH`ed. `PATCH /transactions/:id` only edits `description`, `merchant`, `notes`, `categoryId`, `transactionDate`. Corrections happen by voiding and re-creating, so history stays reconstructible.
- Account balances are **derived, never stored**: `openingBalance + income − expense + transfers (±)` from posted rows — a stale-balance bug is structurally impossible.

## Money and Decimal handling

- Database: `Decimal(14,2)` for every money column (accounts, transactions, budgets, bills, recurring rules).
- Server: Prisma `Decimal` arithmetic only (`utils/money.js` — `toDecimal`, `toAmount`, `addAmounts`, `percentOf`); JavaScript floats never touch an amount. `100.10 + 20.20 = 120.30` holds exactly (covered by tests).
- API: money is serialized as **two-decimal strings** (`"120.50"`), never as JSON numbers, so no client can re-parse a float. Parsing accepts `120.5`, `120.50`, `120` → validated to ≤2 decimals, > 0, within `±999999999999.99`.
- Percentages (`percentUsed`, category `percent`) are computed from Decimal sums and rounded for display only.

## Currency

- One allowlist in `validators/finance.js` (`SUPPORTED_CURRENCIES`, 14 ISO 4217 codes), default **SGD**. Nothing else in the codebase special-cases currency codes.
- Accounts have exactly one currency; transactions/bills/budgets carry the currency they are denominated in.
- **Transfers require equal currencies** on both accounts — the app never invents an exchange rate.
- Reports are single-currency views: the response reports which currencies exist (`availableCurrencies`) and totals one at a time (default: the household's first account currency).

## Accounts and categories

- Accounts: create/update/list/archive (`POST /accounts/:id/archive` deactivates — never a hard delete, so history keeps its reference). Caps: 50 accounts, 100 categories per household.
- Categories come in two scopes: **global** (17 seeded rows with `householdId NULL` — Salary, Groceries, Utilities, Rent, …) and **household** (user-created). Global rows are read-only through the API (`403` on write) and shared by every household; archive instead of delete once referenced (`onDelete: Restrict` prevents orphaning money rows). Duplicate names within a scope conflict (`409`).

## Recurring transactions

- Structured rules — `frequency` ∈ `DAILY | WEEKLY | MONTHLY | YEARLY`, `interval` 1–99, optional `endDate`, `startDate`, `nextOccurrence` cursor. Never free text; the engine is the shared `utils/recurrence.js` used by Tasks/Calendar.
- **Bounded materialization:** due occurrences become real ledger rows only up to *today* (cash basis), at most 60 per run, with a 120-year search horizon for the next cursor. A unique `(recurringTransactionId, transactionDate)` constraint makes generation idempotent — a row can never be posted twice.
- Rules pause/resume (the cursor survives), edit (new occurrences take the new snapshot; generated history keeps its own), and are read through `GET /api/finance/recurring`. Recurring transfers are rejected — only `INCOME`/`EXPENSE`.

## Receipts

Reuses the raw-binary upload architecture from the diary (no multipart):

- One receipt per transaction; body ≤ 5 MB; type decided by **magic bytes** (JPEG, PNG, WebP, PDF only) — the client's filename/Content-Type is never trusted.
- Stored under `app/uploads/finance/` (gitignored volume) with a server-generated random name + validated extension; the database keeps metadata only.
- Served exclusively through the authenticated, household-scoped `GET /transactions/:id/receipt` endpoint (`X-Content-Type-Options: nosniff`, private caching) — never as a static file. `finance-upload` rate limit: 15/min.

## Calendar and dashboard integration

- **Calendar:** unpaid bills due inside the requested range surface as derived, read-only all-day items (`sourceType: BILL`, id `bill:<billId>`, labelled "Bill"). Nothing is persisted to `calendar_events`; paid and cancelled bills disappear; derived ids 404 on detail — same contract as `TASK`/`MEAL` items. Historical transactions never become events.
- **Dashboard:** `GET /api/dashboard` now reports a real `finance` section (status `available`/`empty`): month income/expenses/net in the household's primary currency, budget count/amount/spent/percent, overdue bill count and up to three upcoming bills. `NOT_AVAILABLE_MODULES` no longer lists finance.
- Reports and dashboard read paths call `ensureRecurringOccurrences` first, so due rules are reflected without a separate cron.

## Financial integrity summary

| Guarantee | Mechanism |
| --- | --- |
| Exact arithmetic | Prisma `Decimal(14,2)`; strings over the wire; no float math |
| No double payment | `payBillAtomically` (unique `paid_transaction_id` + status check in one transaction); duplicate → `409` |
| No duplicate generation | unique `(recurringTransactionId, transactionDate)` + cursor advance in the same transaction |
| Reconstructible balances | derived balances; immutable money fields; one-way void with history preserved |
| Household isolation | every query scoped to the session's active household; cross-household ids → `404` |
| Private receipts | authenticated streaming endpoint, magic-byte types, server-generated names |
| Audit trail | `logFinanceEvent` (`account.*`, `transaction.*`, `receipt.*`, `bill.*`) logs identities, ids, amounts, outcomes — never receipt bytes |

## Validation and limits

- Currency: 14-code allowlist, default SGD. Amount: `> 0`, ≤2 decimals, within `±999999999999.99`.
- Lengths: account/category name ≤ 80, bill name ≤ 120, description ≤ 200, merchant ≤ 120, notes ≤ 1000, void reason ≤ 300, search ≤ 100.
- Rate limits: `finance-write` 80/min (all writes), `finance-upload` 15/min (receipts).
- Report months are calendar months; the report page's budget filter accepts `allMonths` (100 budgets/page cap).

## UI

Eight framework-free pages (`finance`, `transaction-form`, `accounts`, `categories`, `budgets`, `bills`, `recurring`, `finance-report`) built from the existing shell, tables, modals, states and theme tokens — compact summaries, one primary action per screen, restrained semantic colours for signed amounts, progress bars for budgets. No new framework, no KPI wall.

## Deferred features

- Multi-currency accounts with explicit conversion/exchange-rate transactions (schema reserves nothing that would block it; the transfer currency rule keeps data clean until then).
- Credit-card statement flows/reconciliation, split transactions, attachments beyond one receipt, budgets for non-monthly periods (`finance_budget_period` enum is the extension point), automatic regeneration of `recurring` bills (informational flag today), notification delivery (Phase 9).

## Testing

- Server: `tests/finance-accounts.test.js`, `finance-categories.test.js`, `finance-transactions.test.js`, `finance-budgets.test.js`, `finance-bills.test.js`, `finance-recurring.test.js`, `finance-receipts.test.js`, `finance-reports.test.js` (63 finance tests; full suite 223 — `npm test`).
- E2E (Playwright): `tests/finance.spec.js` — register → accounts → category/budget → bills + payment + calendar check → expense/income/transfer → recurring → receipt → report → dashboard → responsive overflow at six widths (9 tests).
- Docker smoke (`/tmp/opencode/finance-smoke.mjs`, 20 checks): exact totals, derived balances, duplicate-payment 409, receipt roundtrip, report/dashboard equality through the container.

Companion documents: [finance-transactions.md](finance-transactions.md), [finance-budgets.md](finance-budgets.md), [finance-bills.md](finance-bills.md), [finance-reports.md](finance-reports.md).
