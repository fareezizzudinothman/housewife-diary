# Recipes module

Household cookbook with structured ingredients (Phase 6). Recipes follow the usual layering: `recipeValidators` → `recipeRepository` → `recipeService` → `recipeController` → `recipes.routes`, mounted under `/api/recipes`. Endpoint tables live in [api-design.md](api-design.md); tables in [database-design.md](database-design.md).

## Scope

- Recipe CRUD: title, description, instructions, servings, prep/cook minutes, category, cuisine, notes, favourite flag.
- **Structured ingredients** — every line is a row (`name`, `quantity`, `unit`, `optional`, `notes`, `sortOrder`), never a free-text blob.
- Favourite/unfavourite endpoints, duplicate, search, category filter, favourite filter, sorting and pagination.
- Category metadata (`GET /meta`) for filter UIs.
- Recipes are the source for **recipe → shopping** (see [shopping.md](shopping.md)) and can be attached to planned meals (see [meals.md](meals.md)).

Out of scope (deferred): recipe photos, URL/import scraping, nutrition data, ratings, per-serving cost.

## Data model

```text
recipes             id, household_id (FK, cascade), created_by_id (FK users, cascade),
                    title, description, instructions, servings, prep_minutes, cook_minutes,
                    category, cuisine, is_favourite, notes, created_at, updated_at
                    — indexes (household_id, updated_at DESC), (household_id, is_favourite)

recipe_ingredients  id, recipe_id (FK, cascade), name, normalized,
                    quantity Decimal(12,3) NULL, unit NULL, optional, notes, sort_order
                    — indexes (recipe_id, sort_order), (normalized)
```

- `normalized` is the lowercased, whitespace-collapsed ingredient name used for matching when generating shopping lines.
- Quantities are `Decimal(12,3)` (three decimal places); a line may omit quantity and/or unit (e.g. "Salt, to taste").
- Ingredient order is preserved by `sort_order`, assigned server-side from array position.
- Categories and cuisines are free single-line text (≤60 chars), not enum catalogs.

## Ingredient structure

```json
{
  "name": "Chicken",
  "quantity": 600,
  "unit": "g",
  "optional": false,
  "notes": "diced"
}
```

| Field | Rule |
| --- | --- |
| `name` | 1–120 chars after trim; required for every line |
| `quantity` | > 0 and ≤ 1,000,000, up to 3 decimals; omit for "to taste" lines |
| `unit` | 1–30 chars after trim; empty/omitted → `null` |
| `optional` | boolean, default `false` |
| `notes` | ≤200 chars; optional |
| list | ≤50 ingredients per recipe |

On update, an **absent** `ingredients` key leaves the existing lines untouched; an **empty array** clears them; any supplied array replaces the whole list (inside a transaction).

## Validation and listing

- `title` 1–160 chars (single-line, trimmed); `description` ≤2,000; `instructions` ≤20,000; `notes` ≤2,000; `servings` 1–100; `prepMinutes`/`cookMinutes` 0–1,440.
- `GET /api/recipes` supports `search` (title/description, case-insensitive, LIKE-escaped), `category` (case-insensitive equality), `favourite=true|false`, `sort` ∈ `updated` (default) `| created | title`, `page`, `limit` (≤50) → `{ items, page, limit, total, totalPages }`.
- List items carry `ingredientCount` and a computed `totalMinutes` (`prep + cook`, `null` when both are absent); full ingredients and instructions appear on the detail endpoint.
- `GET /meta` returns the distinct categories in use, sorted A–Z.

## Favourite and duplicate

- `POST /:id/favourite` / `DELETE /:id/favourite` set/clear `is_favourite` (idempotent, `404` across households).
- `POST /:id/duplicate` copies every field and all ingredient lines into a new recipe. The default title appends ` (copy)` (truncated safely at 160 chars); a body `{ "title": "…" }` overrides it. The copy is never a favourite.

## Deletion and meals

Deleting a recipe is safe for the meal plan: planned entries that referenced it keep the recipe **title as a free-text snapshot** (`mealRepository.snapshotRecipeTitles`) before the FK is set to `NULL`. Calendar items for those meals keep rendering the snapshot name — see [meals.md](meals.md).

## Security summary

- Session auth + active household on every route; all ids resolve inside the active household only (`404` otherwise).
- All input validated server-side; user content is rendered with `textContent` only.
- Repository writes re-check ownership (e.g. ingredient replacement runs in a transaction scoped to `{id, householdId}`).
- Rate limit: `recipes-write` 60/min (limiter state resettable for tests).

## Testing

`tests/recipes.test.js` (12 tests) covers 401/403, cross-household 404s, create/update/delete, ingredient replacement and clearing, validation matrices, favourites, duplication, search/category/favourite filters, sorting, pagination, category meta, and the meal-title snapshot on delete. Client flows are verified with Playwright (create with ingredient rows, list rendering, responsive layouts).
