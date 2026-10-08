import { AppError, ErrorCodes } from '../../shared/errors.js';
import * as recipeRepository from '../repositories/recipeRepository.js';
import * as mealRepository from '../repositories/mealRepository.js';
import { decimalToNumber } from '../utils/decimal.js';

const MAX_TITLE = 160;
const COPY_SUFFIX = ' (copy)';

function notFound() {
  return new AppError('Recipe not found.', {
    code: ErrorCodes.NOT_FOUND,
    status: 404,
  });
}

function totalMinutes(recipe) {
  if (recipe.prepMinutes === null && recipe.cookMinutes === null) {
    return null;
  }
  return (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
}

function toIngredientView(ingredient) {
  return {
    id: ingredient.id,
    name: ingredient.name,
    quantity: decimalToNumber(ingredient.quantity),
    unit: ingredient.unit,
    optional: ingredient.optional,
    notes: ingredient.notes,
    sortOrder: ingredient.sortOrder,
  };
}

function toListView(recipe) {
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    category: recipe.category,
    cuisine: recipe.cuisine,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    totalMinutes: totalMinutes(recipe),
    isFavourite: recipe.isFavourite,
    ingredientCount: recipe._count?.ingredients ?? recipe.ingredients?.length ?? 0,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  };
}

function toDetailView(recipe) {
  return {
    ...toListView(recipe),
    instructions: recipe.instructions,
    notes: recipe.notes,
    ingredients: recipe.ingredients.map(toIngredientView),
    createdBy: recipe.createdBy ? { id: recipe.createdBy.id, name: recipe.createdBy.name } : null,
  };
}

export async function listRecipes({ householdId, query }) {
  const where = recipeRepository.buildRecipeWhere(householdId, query);
  const [total, recipes] = await Promise.all([
    recipeRepository.countRecipes(where),
    recipeRepository.listRecipes(where, query),
  ]);
  return {
    items: recipes.map(toListView),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getRecipe({ householdId, id }) {
  const recipe = await recipeRepository.findRecipeById(id, householdId);
  if (!recipe) {
    throw notFound();
  }
  return toDetailView(recipe);
}

export async function createRecipe({ user, householdId, data }) {
  const { ingredients, ...fields } = data;
  const recipe = await recipeRepository.createRecipe(householdId, user.id, fields, ingredients);
  return toDetailView(recipe);
}

export async function updateRecipe({ householdId, id, patch }) {
  const { ingredients, ...fields } = patch;
  const recipe = await recipeRepository.updateRecipe(id, householdId, fields, ingredients);
  if (!recipe) {
    throw notFound();
  }
  return toDetailView(recipe);
}

export async function deleteRecipe({ householdId, id }) {
  const recipe = await recipeRepository.findRecipeById(id, householdId);
  if (!recipe) {
    throw notFound();
  }
  // Planned meals keep the recipe name as free text instead of going empty.
  await mealRepository.snapshotRecipeTitles(householdId, id, recipe.title);
  await recipeRepository.deleteRecipe(id, householdId);
  return { id, deleted: true };
}

export async function setFavourite({ householdId, id, isFavourite }) {
  const recipe = await recipeRepository.findRecipeById(id, householdId);
  if (!recipe) {
    throw notFound();
  }
  const updated = await recipeRepository.updateRecipe(id, householdId, { isFavourite }, undefined);
  return toDetailView(updated);
}

export async function duplicateRecipe({ householdId, id, title }) {
  const source = await recipeRepository.findRecipeById(id, householdId);
  if (!source) {
    throw notFound();
  }
  const copyTitle =
    title ??
    (source.title.length + COPY_SUFFIX.length <= MAX_TITLE
      ? `${source.title}${COPY_SUFFIX}`
      : source.title.slice(0, MAX_TITLE - COPY_SUFFIX.length) + COPY_SUFFIX);
  const ingredients = source.ingredients.map((ingredient) => ({
    name: ingredient.name,
    normalized: ingredient.normalized,
    quantity: decimalToNumber(ingredient.quantity),
    unit: ingredient.unit,
    optional: ingredient.optional,
    notes: ingredient.notes,
    sortOrder: ingredient.sortOrder,
  }));
  const copy = await recipeRepository.createRecipe(
    householdId,
    source.createdById,
    {
      title: copyTitle,
      description: source.description,
      instructions: source.instructions,
      servings: source.servings,
      prepMinutes: source.prepMinutes,
      cookMinutes: source.cookMinutes,
      category: source.category,
      cuisine: source.cuisine,
      notes: source.notes,
      isFavourite: false,
    },
    ingredients,
  );
  return toDetailView(copy);
}

export async function listMeta({ householdId }) {
  const categories = await recipeRepository.listRecipeCategories(householdId);
  return { categories: categories.map((row) => row.category) };
}

// ---- Cross-module read helpers (used by dashboard/shopping) ----

export function toRecipeListView(recipe) {
  return toListView(recipe);
}

export function toRecipeDetailView(recipe) {
  return toDetailView(recipe);
}
