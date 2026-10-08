import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { icon } from '../components/icon.js';
import { emptyState, loadingState, errorState } from '../components/states.js';
import { toast } from '../components/toast.js';
import { describeError, setStatus } from '../utils/forms.js';
import {
  listRecipes,
  getRecipeMeta,
  favouriteRecipe,
  unfavouriteRecipe,
} from '../api/recipes.js';

/* Recipe book — compact list with search/category/favourite filters and a
   star toggle. All user content is rendered via textContent. */

const state = {
  search: '',
  category: '',
  sort: 'updated',
  favourite: '',
  page: 1,
  limit: 12,
};

const listEl = document.querySelector('[data-recipe-list]');
const pagerEl = document.querySelector('[data-pager]');
const pageLabelEl = document.querySelector('[data-page-label]');
const statusEl = document.getElementById('recipe-filter-status');
const filtersForm = document.getElementById('recipe-filters');

function metaText(text) {
  const span = document.createElement('span');
  span.className = 'meta-text';
  span.textContent = text;
  return span;
}

function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined) {
    return null;
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function buildRow(recipe) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'icon-btn star-btn';
  star.setAttribute('aria-pressed', String(recipe.isFavourite));
  star.setAttribute(
    'aria-label',
    recipe.isFavourite ? `Remove “${recipe.title}” from favourites` : `Favourite “${recipe.title}”`,
  );
  star.innerHTML = icon('star');
  star.addEventListener('click', () => toggleFavourite(recipe, star));

  const info = document.createElement('div');
  info.className = 'item-info';
  info.style.flex = '1';

  const title = document.createElement('a');
  title.className = 'recipe-row__title';
  title.href = `/pages/recipe-form.html?id=${encodeURIComponent(recipe.id)}`;
  title.textContent = recipe.title;

  const meta = document.createElement('div');
  meta.className = 'recipe-row__meta';
  const parts = [];
  if (recipe.category) {
    parts.push(recipe.category);
  }
  if (recipe.cuisine) {
    parts.push(recipe.cuisine);
  }
  if (recipe.servings) {
    parts.push(`${recipe.servings} servings`);
  }
  const time = formatMinutes(recipe.totalMinutes);
  if (time) {
    parts.push(time);
  }
  parts.push(
    `${recipe.ingredientCount} ${recipe.ingredientCount === 1 ? 'ingredient' : 'ingredients'}`,
  );
  for (const part of parts) {
    meta.append(metaText(part));
  }

  info.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  const edit = document.createElement('a');
  edit.className = 'icon-btn';
  edit.href = `/pages/recipe-form.html?id=${encodeURIComponent(recipe.id)}`;
  edit.setAttribute('aria-label', `Edit “${recipe.title}”`);
  edit.innerHTML = icon('pencil');
  actions.append(edit);

  row.append(star, info, actions);
  return row;
}

async function toggleFavourite(recipe, button) {
  button.disabled = true;
  try {
    if (recipe.isFavourite) {
      await unfavouriteRecipe(recipe.id);
    } else {
      await favouriteRecipe(recipe.id);
    }
    recipe.isFavourite = !recipe.isFavourite;
    button.setAttribute('aria-pressed', String(recipe.isFavourite));
    if (state.favourite === 'true') {
      await load();
    }
  } catch (error) {
    toast(describeError(error), { type: 'error' });
  } finally {
    button.disabled = false;
  }
}

function renderRecipes(items) {
  const list = document.createElement('div');
  list.className = 'item-list';
  for (const recipe of items) {
    list.append(buildRow(recipe));
  }
  listEl.replaceChildren(list);
}

function renderPagination(data) {
  const showPager = data.totalPages > 1;
  pagerEl.hidden = !showPager;
  if (!showPager) {
    return;
  }
  pageLabelEl.textContent = `Page ${data.page} of ${data.totalPages}`;
  document.querySelector('[data-page-prev]').disabled = data.page <= 1;
  document.querySelector('[data-page-next]').disabled = data.page >= data.totalPages;
}

function isFiltered() {
  return Boolean(state.search || state.category || state.favourite);
}

async function load() {
  listEl.innerHTML = loadingState('Loading recipes…');
  pagerEl.hidden = true;
  setStatus(statusEl, '');

  try {
    const data = await listRecipes(state);
    if (!data.items.length) {
      if (isFiltered()) {
        listEl.innerHTML = emptyState({
          iconName: 'book',
          title: 'No recipes match',
          text: 'Try a different search or clear the filters.',
          action: '<button type="button" class="btn btn--secondary btn--small" data-clear-filters>Clear filters</button>',
        });
        listEl.querySelector('[data-clear-filters]').addEventListener('click', resetFilters);
        setStatus(statusEl, 'No matching recipes.');
      } else {
        listEl.innerHTML = emptyState({
          iconName: 'book',
          title: 'No recipes yet',
          text: 'Add a family favourite and its ingredients — they can be added to shopping later.',
          action: '<a class="btn btn--primary btn--small" href="/pages/recipe-form.html">Add a recipe</a>',
        });
      }
      return;
    }
    renderRecipes(data.items);
    renderPagination(data);
    setStatus(
      statusEl,
      `${data.total} ${data.total === 1 ? 'recipe' : 'recipes'}${isFiltered() ? ' match' : ''}`,
    );
  } catch (error) {
    if (error?.status === 403) {
      listEl.innerHTML = `
        <div class="alert alert--warning" role="alert">
          <strong>No active household.</strong> Create or join a household to keep recipes.
          <a href="/pages/household.html">Set up a household</a>
        </div>`;
      return;
    }
    listEl.innerHTML = errorState(describeError(error));
  }
}

function readFilters() {
  state.search = filtersForm.search.value.trim();
  state.category = filtersForm.category.value;
  state.sort = filtersForm.sort.value || 'updated';
  state.favourite = filtersForm.favourite.checked ? 'true' : '';
}

function resetFilters() {
  filtersForm.reset();
  readFilters();
  state.page = 1;
  load();
}

async function loadCategoryOptions() {
  try {
    const meta = await getRecipeMeta();
    const select = filtersForm.category;
    select.length = 1;
    for (const category of meta.categories) {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      select.append(option);
    }
  } catch {
    // The filter stays usable without the option list.
  }
}

function wireEvents() {
  filtersForm.addEventListener('submit', (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    load();
  });
  filtersForm.category.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  filtersForm.sort.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  filtersForm.favourite.addEventListener('change', () => {
    readFilters();
    state.page = 1;
    load();
  });
  document.querySelector('[data-reset]').addEventListener('click', resetFilters);
  document.querySelector('[data-page-prev]').addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    load();
  });
  document.querySelector('[data-page-next]').addEventListener('click', () => {
    state.page += 1;
    load();
  });
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);
  wireEvents();
  await loadCategoryOptions();
  await load();
}

init().catch((error) => {
  listEl.innerHTML = errorState(describeError(error));
});
