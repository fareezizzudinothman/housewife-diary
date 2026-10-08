# Finance reports

Two read paths summarize money: the monthly report page (`GET /api/finance/reports/monthly`) and the dashboard's `finance` section. Both aggregate in PostgreSQL (`groupBy`/`sum`/`count`) — transactions are never loaded into Node to compute totals.

## Monthly report

`GET /api/finance/reports/monthly?year=2026&month=10&currency=SGD`

1. Materializes due recurring occurrences for the household (report is always current).
2. Resolves scope: `year`/`month` default to the session timezone's current month; `currency` defaults to the first account's currency; `availableCurrencies` lists every currency with accounts or activity.
3. Runs grouped aggregations over **posted, same-currency** rows with `transactionDate ∈ [month start, month end)`.

Response `data`:

| Field | Content |
| --- | --- |
| `income`, `expenses`, `net` | month totals as two-decimal strings (`net = income − expenses`, Decimal) |
| `transactionCount` | posted income + expense rows (transfers excluded) |
| `expenseByCategory[]`, `incomeByCategory[]` | `{ categoryId, name, icon, total, count, percent, rank, of }` sorted by total |
| `topExpenseCategories[]` | first five of `expenseByCategory` |
| `budgets[]`, `budgetTotals` | live budget-vs-actual for the month ([finance-budgets.md](finance-budgets.md)) |
| `bills` | `{ dueInMonth, overdue, paid, upcoming }` |
| `upcomingBills[]` | next five unpaid bills (bill detail shape with derived status) |
| `accounts[]` | accounts in this currency with **derived balance** (`opening + income − expense ± transfers`) |
| `generatedAt` | ISO timestamp |

Transfers never appear in income/expense totals; voided rows never appear in any total (they remain reachable through the transaction list with `status=ALL`).

### Percent and ranking rules

`percent = part / total × 100` from Decimal sums (`percentOf`), 0 when the total is 0; `rank`/`of` describe position within the full sorted list so `topExpenseCategories` keeps its context.

## Dashboard finance section

`GET /api/dashboard` → `data.finance`:

```json
{
  "status": "available",
  "currency": "SGD",
  "year": 2026, "month": 10,
  "income": "4500.00", "expenses": "370.50", "net": "4129.50",
  "budgets": { "count": 1, "amount": "600.00", "spent": "120.50", "percentUsed": 20.1 },
  "overdueBillCount": 0,
  "upcomingBills": [ { "id", "name", "amount", "currency", "dueDate", "status", "category" } ]
}
```

- `status` is `empty` until the household has any accounts, transactions, budgets or bills — no fake numbers (the module previously reported `not_available`; that flag is gone).
- Same aggregation rules as the report: current month, primary currency, posted rows only, recurring materialized first.
- The client shows one compact finance block in the Today panel plus the module tile — consistent with the minimalist dashboard (no extra cards).

## Client pages

- `finance-report.html/js` — month/currency selectors, summary line, expense/income category breakdowns, budget progress, bills, account balances; loading/empty/error states from the shared components.
- `dashboard.html` — finance Today-panel rows and the `Finance` module tile linking to `finance.html`.

Tests: `tests/finance-reports.test.js` (7) — exact income/expense/net arithmetic, category totals and percentages, budget comparison, bill summary, account balances, currency scoping, dashboard contract and cross-household isolation. The Docker smoke re-verifies report/dashboard equality through the container (20/20).
