# Meals module

Weekly household meal planner (Phase 6). Meals follow the usual layering: `mealValidators` → `mealRepository` → `mealService` → `mealController` → `meals.routes`, mounted under `/api/meals`. Endpoint tables live in [api-design.md](api-design.md); tables in [database-design.md](database-design.md).

## Scope

- Meal plan entries: one dated meal slot with either a **recipe reference** or a **free-text title**.
- Meal types: `BREAKFAST | LUNCH | SNACK | DINNER` (display order is breakfast, lunch, snack, dinner — independent of enum order).
- Ranged/weekly queries with timezone-aware defaults and a 90-day cap.
- **Meal → calendar integration:** planned meals appear as derived, all-day `sourceType: MEAL` calendar items.
- **Meal plan → shopping:** a read-only preview endpoint aggregates the recipe ingredients planned in a period; the commit happens on the shopping list (see [shopping.md](shopping.md)).
- Weekly planner client with four slots per day and a recipe picker.

Out of scope (deferred): repeating meal plans/templates, per-meal servings, ingredient auto-deduction from inventory, reminder delivery (Phase 9).

## Data model

```text
meal_plan_entries  id, household_id (FK, cascade), created_by_id (FK users, cascade),
                   recipe_id (FK recipes, SET NULL), date (DATE), meal_type (meal_type enum),
                   title, notes, created_at, updated_at
                   — indexes (household_id, date), (household_id, meal_type), (recipe_id)
```

- The recipe is **referenced, never copied**. `title` labels meals without a recipe and doubles as the snapshot when a recipe is deleted (`SET NULL` + title snapshot in the service).
- `displayTitle` is resolved defensively: recipe title → free-text title → the slot's label ("Breakfast"…). This means a meal row can never render empty.

## Validation

| Field | Rule |
| --- | --- |
| `date` | required `YYYY-MM-DD` (1900–2100, impossible dates rejected) |
| `mealType` | required member of `BREAKFAST \| LUNCH \| SNACK \| DINNER` |
| `recipeId` | optional; must reference a recipe **in the same household**, else `400` on `recipeId` |
| `title` | optional 1–160 chars (single-line); required when no `recipeId` is given |
| `notes` | optional ≤1,000 chars (multi-line) |

Partial updates exist for every field, but a meal must always keep at least one of `recipeId`/`title`: clearing both returns `400`.

## Range queries

`GET /api/meals?from=YYYY-MM-DD&to=YYYY-MM-DD&mealType=…`

- Missing bounds default to the **current Monday-to-Sunday week** in the user's timezone (`users.timezone`, default UTC).
- One bound alone expands to a seven-day window (`from` → +6 days, `to` → −6 days).
- `to < from` and ranges ≥90 days return `400`.
- Results are sorted by date, then meal order, then creation time; `mealType` narrows the list.
- Response: `{ items, from, to }`.

## Calendar integration

`GET /api/calendar` includes each planned meal in the queried window as a derived item (`mealService.toMealEventView`):

- `id` is namespaced `meal:<entryId>`, `sourceType: "MEAL"`, `sourceId` is the entry id; fetching `meal:<id>` from `/api/calendar/:id` returns `404` (derived items are never persisted).
- `allDay: true`; `startAt`/`endAt` are a nominal local hour (breakfast 8, lunch 12, snack 15, dinner 18) so day ordering stays natural while the client suppresses the time.
- `title` is the display title (recipe title, snapshot or free text) and `meal` carries `{ id, mealType, title, recipe }`.
- If the recipe is later deleted, the snack-free snapshot keeps the item meaningful.

## Meal plan → shopping preview

`GET /api/meals/shopping-plan?from=…&to=…` (same range rules) aggregates every **recipe ingredient** of the planned meals in the window:

- Lines are summed per normalized ingredient name + unit; meals without a recipe contribute nothing.
- Each item reports `{ name, quantity, unit, category: "OTHER", sources[] }` where `sources` names the meal (`mealId`, `date`, `mealType`, `recipe`).
- Read-only: the caller reviews the preview on a shopping list and commits the selected items through `POST /api/shopping-lists/:id/from-meals` — see [shopping.md](shopping.md).

## Security summary

- Session auth + active household on every route; cross-household ids return `404` and recipes from another household cannot be referenced.
- All input validated server-side; references are re-checked against the active household in the service.
- Date math happens server-side from the session timezone; range caps bound query cost.
- Rate limit: `meals-write` 60/min (limiter state resettable for tests).

## Testing

`tests/meals.test.js` (10 tests) covers 401/403, cross-household isolation, recipe/free-text creation and display-title fallbacks, validation (missing/invalid date, slot, pairing, foreign recipe), updates including clearing, deletion, the current-week default, explicit ranges and slot filters, the 90-day cap, calendar `MEAL` events (all-day, nominal hours, source ids) and the recipe-title snapshot surviving recipe deletion. Client flows are verified with Playwright (week planner, meal create, calendar appearance, responsive layouts).
