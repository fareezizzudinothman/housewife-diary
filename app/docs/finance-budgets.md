# Finance budgets

Monthly spending targets per expense category — a *plan*, never a ledger row.

## Model

- One row per `(household, category, period, year, month)` — the composite unique constraint is the duplicate guard (`409 CONFLICT` on the second create).
- `period` is `finance_budget_period` (`MONTHLY` today; the enum is the extension point for other periods).
- Amount: `Decimal(14,2)`, positive, ≤ 2 decimals; currency from the allowlist (default `SGD`).
- Category must be an **expense** category of the household or a global seed (`400` otherwise).

## Budget vs actual

`spent` is **derived at read time** — never stored:

1. `spendForBudgets()` aggregates posted `EXPENSE` rows per `(year, month, currency, categoryId)` in one grouped query.
2. `toBudgetView()` combines target + spend into `{ amount, spent, remaining, percentUsed, overBudget }`.

Because the value is computed, `createBudget`, `updateBudget` and `getBudget` all return the **current** spend for the month — creating a budget mid-month immediately shows what has already been spent. `remaining = amount − spent` (can go negative); `overBudget` flips when `spent > amount`; `percentUsed` comes from `percentOf()` (Decimal division rounded to one decimal; it returns `null` only for a zero base, which can occur in month totals when no budgets exist — reported as `percentUsed: null`).

Totals (`budgetTotals`) sum Decimal amounts and spends across the month before dividing, so the aggregate percentage equals `totalSpent / totalAmount`, not an average of per-row percentages.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/finance/budgets` | `year`, `month`, `categoryId`, `page`, `limit` (≤ 100); each item carries live `spent`/`percentUsed` |
| POST | `/api/finance/budgets` | `201 { budget }` with derived spend; duplicate → `409` |
| GET | `/api/finance/budgets/:id` | detail with derived spend |
| PATCH | `/api/finance/budgets/:id` | `amount` and `notes` only — category, currency and period are immutable (`400` with "delete this budget and create another"); re-derives spend for the response |
| DELETE | `/api/finance/budgets/:id` | `200 { id, deleted: true }` — only the plan is deleted; transactions are untouched |

## Where budgets appear

- **Monthly report:** `budgets[]` + `budgetTotals` for the reported month/currency ([finance-reports.md](finance-reports.md)).
- **Dashboard:** budget count/amount/spent/percentUsed for the current month.
- **UI (`budgets.html`):** month picker, optional "all months", one compact row per category with a progress bar and restrained over-budget colouring.

Tests: `tests/finance-budgets.test.js` (7) — CRUD, duplicate `409`, category/type validation, derived spend after create/update, remaining/over-budget arithmetic, Decimal accuracy and household isolation.
