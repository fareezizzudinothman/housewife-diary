# Finance bills

A bill is a **financial obligation**, not a transaction. It lives in `finance_bills` until it is paid — only then does money actually move.

## Lifecycle and statuses

```text
              pay (atomic)
UPCOMING ─────────────────────► PAID          (final; edit/cancel → 409)
   │  ▲                             │
   │  │ void of the payment         │ cancel (final)
   ▼  │ (reopens the bill)          ▼
OVERDUE / DUE (derived)         CANCELLED
```

- **Stored** status (`FinanceBillStatus`): `UPCOMING | PAID | CANCELLED` — only these three exist in the database.
- **Derived** status (read time, `deriveBillStatus(bill, today)`): `UPCOMING` (due after today), `DUE` (due today), `OVERDUE` (past due) layered on top of stored `PAID`/`CANCELLED`. `today` is the session timezone's calendar day at UTC midnight, so "due today" means the user's today. The API exposes both (`status`, `storedStatus`).
- List filters accept the derived vocabulary: `?status=UPCOMING|DUE|OVERDUE|PAID|CANCELLED|ALL`.

## Paying a bill — atomic bill + transaction

`POST /api/finance/bills/:id/pay` with optional `{ amount, transactionDate, accountId, description, merchant, notes }` (payment can differ from the bill, but stays within the bill's currency; account must match it).

Everything happens in **one Prisma transaction** (`payBillAtomically`):

1. Re-check `status = UPCOMING` and `paid_transaction_id IS NULL` inside the transaction.
2. Insert the `EXPENSE` ledger row (`sourceType: BILL`, `sourceId: billId`, bill's category/account).
3. Set `status = PAID`, `paidAt`, `paid_transaction_id` (unique).

Outcomes:

- Success → `201 { bill, transaction }` + `bill.paid` audit event.
- A second payment (double click, retry, another tab) → **`409 CONFLICT`** and exactly **one** expense — proven by tests and the Docker smoke run.
- Because `paid_transaction_id` is unique and the status check runs inside the transaction, concurrent payments cannot race.

Payment overrides (`amount`, `transactionDate`, `accountId`) are validated like any transaction (positive ≤2-decimal amount, valid account, matching currency).

## Voiding a payment reopens the bill

`POST /transactions/:id/void` on the bill's expense runs `voidTransactionAtomically`: the transaction becomes `VOIDED` **and** the bill returns to `UPCOMING` with `paidAt`/`paidTransactionId` cleared. The bill can then be corrected and paid again — history keeps both movements (one voided, one posted). Voiding is still one-way for the transaction itself.

## Editing and cancelling

- Unpaid bills: `PATCH` name, amount, currency, due date, category, account, notes and the recurring flag; `status` is rejected here ("Use the pay or cancel endpoint").
- `POST /:id/cancel` → `CANCELLED` (final, `cancelledAt` stamped) + `bill.cancelled` audit event; cancel of a paid bill → `409`.
- Paid bills: no edit, no cancel → `409` with guidance ("Void the payment instead").

## Calendar integration

Unpaid bills due inside a calendar range surface through `GET /api/calendar` as derived, read-only items — following the existing `sourceType` abstraction (like `TASK` and `MEAL`):

- `sourceType: "BILL"`, id `bill:<billId>`, `allDay: true` on the due date, meta label "Bill", `bill: { amount, currency, dueDate, status, category }`.
- Never persisted to `calendar_events`; paid/cancelled bills disappear from the calendar; `GET /api/calendar/bill:<id>` → `404`; other households never see them.
- The client links the row to `bills.html`. Historical transactions never become calendar events.

## Recurring bills

`recurring` is an informational flag today ("this obligation repeats") — automatic regeneration of bills is deliberately deferred; recurring *transactions* ([finance.md](finance.md)) are the ledger-level mechanism.

## Dashboard and report

`getBillSummary` reports `{ dueInMonth, overdue, paid, upcoming }`; reports embed it plus up to five `upcomingBills`; the dashboard exposes `overdueBillCount` and three upcoming bills. Report and dashboard reads materialize due recurring occurrences first.

Tests: `tests/finance-bills.test.js` (10) — isolation, derived statuses, validation matrix, atomic payment + duplicate `409` + override rules, cancel finality, void → reopen → re-pay, and the calendar derivation (paid/cancelled excluded, derived id 404, cross-household empty).
