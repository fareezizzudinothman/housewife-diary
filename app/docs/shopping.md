# Shopping module

Household shopping lists with recipe and meal-plan import (Phase 6). Shopping follows the usual layering: `shoppingValidators` → `shoppingRepository` → `shoppingService` → `shoppingController` → `shopping.routes`, mounted under `/api/shopping-lists`. Endpoint tables live in [api-design.md](api-design.md); tables in [database-design.md](database-design.md).

## Scope

- Shopping list CRUD, search, pagination and **archive** (archived lists are hidden by default; `?archived=true` lists them).
- Item CRUD with name, quantity, unit, category and notes; `purchased` is a timestamp (`purchasedAt`), so purchase/unpurchase is naturally reversible.
- Item search and `purchased`/`category` filters; unpurchased lines sort first.
- **Recipe → shopping** with serving scaling and a deterministic merge strategy.
- **Meal plan → shopping** in two steps: a reviewable preview and an explicit commit of selected items.
- **Shopping → inventory** as an explicit per-item action that records a `PURCHASE` transaction and marks the line bought.
- Dashboard integration: the most recently touched active list is the dashboard's "Shopping" summary.

Out of scope (deferred): store/location organization, per-item price tracking and totals, barcode scanning, shared list editing presence, recurring lists.

## Data model

```text
shopping_lists       id, household_id (FK, cascade), created_by_id (FK users, cascade),
                     name, notes, archived_at, created_at, updated_at
                     — index (household_id, archived_at)

shopping_list_items  id, list_id (FK, cascade), recipe_id (FK recipes, SET NULL),
                     name, normalized, quantity Decimal(12,3) NULL, unit NULL,
                     category (item_category, default OTHER), notes, purchased_at,
                     created_at, updated_at
                     — indexes (list_id, purchased_at), (list_id, category), (normalized)
```

- `normalized` is the lowercased, whitespace-collapsed item name.
- `recipe_id` is traceability only (which recipe generated/merged the line); deleting the recipe keeps the line (`SET NULL`).
- Item changes bump the list's `updated_at` so the dashboard surfaces the list the household is actually working on.
- List responses carry `itemCount` and `remaining` (unpurchased count).

## Purchase semantics

- `PATCH /:id/items/:itemId { "purchased": true }` stamps `purchasedAt`; `false` clears it. No separate endpoints and no destructive state change.
- A purchased line is **closed**: recipe/meal imports never merge into it (a new line is created instead).
- Lists are not auto-cleared; users archive them when done.

## Recipe → shopping and serving scaling

`POST /api/shopping-lists/:id/from-recipe/:recipeId` with optional `{ "servings": n }`.

- Scale factor = `requested servings ÷ recipe.servings` when both are present and the recipe has a serving count; otherwise `1`.
- `quantity × factor` is rounded to three decimals; ingredients without a quantity stay quantity-less.
- The response reports `{ list, added, merged, items[] }` where `items` are the lines touched by this call.

### Merge strategy

For each incoming ingredient, the service looks for an **unpurchased** line in the target list with the same `normalized` name **and** the same unit (case-insensitive; empty unit matches empty unit):

| Situation | Result |
| --- | --- |
| Matching line found | Quantities are summed (line stays unpurchased); `recipeId` is kept if it already had one |
| Same name, **different unit** | A separate line is created — units are not converted |
| Matching line is purchased | A new unpurchased line is created |
| Existing line has no unit, incoming has one | The unit is adopted |
| Existing category is `OTHER`, incoming is specific | The specific category wins |
| No match | A new line is created |

## Meal plan → shopping

Two-step by design so the user stays in control:

1. **Preview** — `GET /api/meals/shopping-plan?from=…&to=…` (see [meals.md](meals.md)) aggregates the recipe ingredients of planned meals in the range, including per-item `sources`.
2. **Commit** — `POST /api/shopping-lists/:id/from-meals` with `{ from, to, items? }`:
   - With `items`, exactly the reviewed/selected lines are committed (each `{ name, quantity?, unit?, category? }`).
   - Without `items`, the live aggregation is committed.
   - Committed lines go through the same merge strategy (so they combine with existing open lines), and the response reports `{ list, added, merged }`.

## Shopping → inventory

`POST /api/shopping-lists/:id/items/:itemId/to-inventory` with optional `{ location, category, expiresAt, quantity, note }`.

- Requires the item to be a line on the list; the shopping line is **always marked purchased** by this action (idempotent — an already-purchased line keeps its timestamp).
- Inventory quantity defaults to the line quantity (or `1` when both are absent), overridable via `quantity`.
- Stock is merged into an existing inventory item with the same normalized name + unit and recorded as a `PURCHASE` transaction; a different unit creates a separate inventory item. Full semantics: [inventory.md](inventory.md).
- The response is `{ item, inventoryItem, merged }`.

## Validation

| Field | Rule |
| --- | --- |
| list `name` | 1–120 chars, single-line, trimmed |
| list `notes` | ≤1,000 chars; optional |
| `archived` | boolean |
| item `name` | 1–120 chars, single-line, trimmed (required) |
| item `quantity` | > 0 and ≤ 1,000,000, up to 3 decimals; omitted/empty → `null` |
| item `unit` | 1–30 chars; omitted/empty → `null` |
| item `category` | `PRODUCE \| MEAT \| SEAFOOD \| DAIRY \| PANTRY \| FROZEN \| DRINKS \| HOUSEHOLD \| OTHER` (default `OTHER`) |
| item `notes` | ≤300 chars; optional |
| item `purchased` | boolean |
| `from-recipe` `servings` | integer 1–100; optional |
| `from-meals` | `from`/`to` required, `to ≥ from`, range <90 days, ≤100 selected items |

List queries accept `search`, `archived`, `page`, `limit` (≤50). Item queries accept `search`, `purchased`, `category`, `page`, `limit` (≤200, default 100).

## Security summary

- Session auth + active household on every route; cross-household list/item/recipe ids return `404` (no existence leaks).
- Reusing another household's recipe or item ids inside a list is impossible — the list itself is resolved first, then the recipe inside `addFromRecipe` is looked up with the active household.
- All input validated server-side; user content is rendered with `textContent` only.
- Rate limit: `shopping-write` 80/min (limiter state resettable for tests).

## Testing

`tests/shopping.test.js` (12 tests) covers 401/403, cross-household 404s, list CRUD/archive/filters, item CRUD and validation, purchase/unpurchase and remaining counts, recipe scaling and merge rules (case-insensitive match, different units, closed purchased lines, category adoption), the meal-plan preview and selected commit, and shopping → inventory creation/merge with ledger checks. Client flows are verified with Playwright (list create, item add, purchase, recipe scaling, meal-plan commit, inventory handoff, responsive layouts).
