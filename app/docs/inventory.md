# Inventory module

Household pantry/fridge/freezer stock with a complete transaction ledger (Phase 6). Inventory follows the usual layering: `inventoryValidators` → `inventoryRepository` → `inventoryService` → `inventoryController` → `inventory.routes`, mounted under `/api/inventory`. Endpoint tables live in [api-design.md](api-design.md); tables in [database-design.md](database-design.md).

## Scope

- Inventory item CRUD (name, unit, category, location, expiry, minimum quantity, notes).
- **Every quantity change is a transaction** — stock actions (`consume`, `waste`, `add-stock`, `adjust`) and explicit shopping handoff. Direct quantity `PATCH` is rejected by design.
- Per-item transaction history with the resulting balance (`quantityAfter`), reconstructing the full ledger.
- Derived (never stored) stock and expiry status, filters for both, and dashboard alerts.
- Shopping → inventory merge with a `PURCHASE` transaction.

Out of scope (deferred): a household-managed category table (the `item_category` enum is the shared vocabulary), barcode scanning, automatic deduction when meals are cooked, expiry notification delivery (Phase 9), waste/spend analytics.

## Data model

```text
inventory_items         id, household_id (FK, cascade), created_by_id (FK users, cascade),
                        name, normalized, quantity Decimal(12,3) default 0, unit NULL,
                        category (item_category default OTHER),
                        location (inventory_location default PANTRY),
                        expires_at (DATE) NULL, minimum_quantity Decimal(12,3) default 0,
                        notes, created_at, updated_at
                        — indexes (household_id, normalized), (household_id, expires_at),
                          (household_id, category), (household_id, location)

inventory_transactions  id, household_id (FK, cascade), item_id (FK, cascade),
                        created_by_id (FK users, cascade),
                        type (inventory_transaction_type),
                        quantity_delta Decimal(12,3), quantity_after Decimal(12,3),
                        note, created_at
                        — indexes (item_id, created_at DESC), (household_id, created_at DESC)
```

- `normalized` is the lowercased, whitespace-collapsed name used for shopping merge matching.
- `minimum_quantity` 0 means "no threshold" — the item can never be low-stock from the threshold rule.
- Transactions cascade with their item; deleting an item deletes its history.

## Quantity is ledger-only

`PATCH /api/inventory/:id` accepts metadata (name, unit, category, location, minimum quantity, expiry, notes) but **rejects `quantity`** with a validation error pointing at the transaction endpoints, so no stock change can happen without a ledger row.

Creating an item with `quantity > 0` records an opening `PURCHASE` transaction (`Initial stock`, `quantityAfter = quantity`); creating with `0` records nothing.

### Actions

| Endpoint | Type | Effect | `quantity` |
| --- | --- | --- | --- |
| `POST /:id/add-stock` | `PURCHASE` | `quantity += n` | required, > 0 |
| `POST /:id/consume` | `CONSUME` | `quantity -= n` | required, > 0 |
| `POST /:id/waste` | `WASTE` | `quantity -= n` | required, > 0 |
| `POST /:id/adjust` | `ADJUST` | sets the absolute value | required, ≥ 0 |

Every action returns `{ item, transaction }` and runs atomically: the item update and ledger row share one Prisma transaction. `quantityDelta` is the effective change (`after − before`, so an adjust that doesn't move the value records `0`), and `quantityAfter` is the resulting balance. **Negative stock is impossible** — any action that would push the balance below zero returns `400` and leaves both item and ledger untouched.

`GET /:id/transactions` returns newest first with `{ type, quantityDelta, quantityAfter, note, createdBy }`, paginated (`page`, `limit` ≤100, default 20).

## Derived status

Statuses are computed per request, never stored:

```text
stock:   quantity <= 0                → OUT_OF_STOCK
         0 < quantity <= minimum      → LOW_STOCK
         quantity > minimum           → IN_STOCK

expiry:  expires_at <  local today     → EXPIRED
         today <= expires_at         → EXPIRING_SOON   (within the 7-day horizon)
         later / no expiry           → null
```

- Day boundaries come from the session timezone (`users.timezone`, default UTC), so "today" matches the user's calendar.
- The expiring-soon horizon is **7 days** (`today + 7`).
- `GET /api/inventory` filters: `search` (name, LIKE-escaped), `category`, `location`, `stock` ∈ `in_stock | low_stock | out_of_stock`, `expiry` ∈ `expired | expiring_soon | none`; rows sort by nearest expiry (nulls last) then name; `page`/`limit` (≤50, default 20).

## Shopping → inventory

`shoppingService.addItemToInventory` delegates to `inventoryService.addFromShopping`:

- Merge key is normalized name + unit (case-insensitive); a match increases quantity and records a `PURCHASE` transaction (`Added from a shopping list` by default). A different unit creates a separate item — units are not converted.
- On a merge, non-default category/location/expiry values from the handoff are applied to the existing item.
- The shopping line is always marked purchased by the caller — see [shopping.md](shopping.md).

## Dashboard alerts

`GET /api/dashboard` uses `inventoryService.getInventoryAlerts`:

- Counts: `lowStockCount`, `outOfStockCount`, `expiringSoonCount`, `expiredCount`.
- `alerts` lists up to three items, ordered by severity `EXPIRED → OUT_OF_STOCK → EXPIRING_SOON → LOW_STOCK`, then expiry date, then name.
- An item contributes to both a stock and an expiry count when both conditions hold; the dashboard "Stock alerts" tile sums the four counts.

## Validation

| Field | Rule |
| --- | --- |
| `name` | 1–120 chars, single-line, trimmed (required) |
| `quantity` (create) | 0–1,000,000, up to 3 decimals (default 0) |
| `minimumQuantity` | 0–1,000,000 (default 0) |
| `unit` | 1–30 chars; omitted/empty → `null` |
| `category` | `PRODUCE \| MEAT \| SEAFOOD \| DAIRY \| PANTRY \| FROZEN \| DRINKS \| HOUSEHOLD \| OTHER` (default `OTHER`) |
| `location` | `PANTRY \| REFRIGERATOR \| FREEZER \| HOUSEHOLD \| OTHER` (default `PANTRY`) |
| `expiresAt` | `YYYY-MM-DD` or `null` to clear |
| `notes` | ≤1,000 chars; optional |
| action `note` | ≤300 chars; optional |

## Security summary

- Session auth + active household on every route; cross-household ids return `404` for reads, writes, actions and history.
- Applied changes are computed server-side from the stored quantity — clients can never set an arbitrary balance or create negative stock.
- All input validated server-side; no direct quantity mutation path exists.
- Rate limit: `inventory-write` 80/min (limiter state resettable for tests).

## Testing

`tests/inventory.test.js` (10 tests) covers 401/403, isolation, creation defaults and opening balance, validation, metadata-only updates with quantity rejection, all four stock actions with ledger deltas and balances, negative-stock rejection, derived stock statuses and transitions, expiry statuses and the 7-day horizon, search/category/location/stock/expiry filters and pagination. `tests/shopping.test.js` additionally covers the shopping → inventory merge and `PURCHASE` ledger. Client flows are verified with Playwright (consume, low stock, expiry, responsive layouts).
