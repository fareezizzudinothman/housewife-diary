import * as diaryRepository from '../repositories/diaryRepository.js';
import * as householdRepository from '../repositories/householdRepository.js';
import * as householdMemberRepository from '../repositories/householdMemberRepository.js';
import * as taskRepository from '../repositories/taskRepository.js';
import * as calendarRepository from '../repositories/calendarRepository.js';
import * as mealRepository from '../repositories/mealRepository.js';
import * as shoppingRepository from '../repositories/shoppingRepository.js';
import * as recipeRepository from '../repositories/recipeRepository.js';
import * as inventoryService from './inventoryService.js';
import { MEAL_ORDER, toMealSummaryView } from './mealService.js';
import { DAY_MS } from '../utils/recurrence.js';
import { getZonedNextStartOfDay, getZonedStartOfDay, toDateString } from '../utils/time.js';
import { parseDateString } from '../validators/format.js';

// Modules that are not implemented yet are reported explicitly so the
// dashboard can render a graceful placeholder instead of fake data.
const NOT_AVAILABLE_MODULES = ['finance'];

const UPCOMING_EVENT_LIMIT = 3;
const RECENT_TASK_LIMIT = 5;
const FAVOURITE_RECIPE_LIMIT = 3;
const INVENTORY_ALERT_LIMIT = 3;
const WEEK_DAYS = 7;

function toRecentEntryView(entry) {
  return {
    id: entry.id,
    title: entry.title,
    entryDate: entry.entryDate.toISOString().slice(0, 10),
    timeOfDay: entry.timeOfDay,
    mood: entry.mood ? { id: entry.mood.id, name: entry.mood.name } : null,
    attachmentCount: entry._count.attachments,
    createdAt: entry.createdAt,
  };
}

function toTaskSummaryView(task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
    category: task.category ? { id: task.category.id, name: task.category.name } : null,
  };
}

function toEventSummaryView(event) {
  return {
    id: event.id,
    title: event.title,
    startAt: event.startAt.toISOString(),
    allDay: event.allDay,
    category: event.category,
  };
}

export async function getDashboard({ user, householdId, householdRole }) {
  const scope = { householdId, userId: user.id };
  const timezone = user.timezone ?? 'UTC';
  const now = new Date();
  const startOfToday = new Date(getZonedStartOfDay(now, timezone));
  const endOfToday = new Date(getZonedNextStartOfDay(now, timezone) - 1);
  const weekAhead = new Date(now.getTime() + WEEK_DAYS * DAY_MS);
  const todayDate = parseDateString(toDateString(now, timezone));
  const tomorrowDate = new Date(todayDate.getTime() + DAY_MS);
  const nextWeekDate = new Date(todayDate.getTime() + (WEEK_DAYS + 1) * DAY_MS);

  const [
    household,
    memberCounts,
    diaryCount,
    recentEntries,
    openTaskCount,
    dueTodayCount,
    recentTasks,
    weekEventCount,
    upcomingEvents,
    todayMeals,
    upcomingMeals,
    activeList,
    activeListRemaining,
    recipeCount,
    favouriteRecipes,
    inventoryAlerts,
  ] = await Promise.all([
    householdRepository.findById(householdId),
    householdMemberRepository.countByHouseholdIds([householdId]),
    diaryRepository.countEntries(scope),
    diaryRepository.listEntries(scope, { page: 1, limit: 5 }),
    taskRepository.countOpenTasks(householdId),
    taskRepository.countTasksDueBetween(householdId, startOfToday, endOfToday),
    taskRepository.listRecentOpenTasks(householdId, RECENT_TASK_LIMIT),
    calendarRepository.countEventsStartingBetween(householdId, now, weekAhead),
    calendarRepository.listUpcomingEvents(householdId, now, weekAhead, UPCOMING_EVENT_LIMIT),
    mealRepository.listForDate(householdId, todayDate),
    mealRepository.listRange(householdId, tomorrowDate, nextWeekDate),
    shoppingRepository.findActiveList(householdId),
    shoppingRepository.countRemainingForHousehold(householdId),
    recipeRepository.countRecipesForHousehold(householdId),
    recipeRepository.listFavouriteRecipes(householdId, FAVOURITE_RECIPE_LIMIT),
    inventoryService.getInventoryAlerts({
      householdId,
      timezone,
      limit: INVENTORY_ALERT_LIMIT,
    }),
  ]);

  const orderedTodayMeals = [...todayMeals].sort(
    (a, b) => (MEAL_ORDER[a.mealType] ?? 9) - (MEAL_ORDER[b.mealType] ?? 9),
  );
  const nextMeal =
    upcomingMeals.length > 0
      ? [...upcomingMeals].sort(
          (a, b) =>
            a.date.getTime() - b.date.getTime() ||
            (MEAL_ORDER[a.mealType] ?? 9) - (MEAL_ORDER[b.mealType] ?? 9),
        )[0]
      : null;

  const inventoryAlertCount =
    inventoryAlerts.lowStockCount +
    inventoryAlerts.outOfStockCount +
    inventoryAlerts.expiringSoonCount +
    inventoryAlerts.expiredCount;

  const dashboard = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      timezone,
    },
    household: household
      ? {
          id: household.id,
          name: household.name,
          role: householdRole,
          memberCount: memberCounts.find((row) => row.householdId === householdId)?._count
            .userId ?? 0,
        }
      : null,
    diary: {
      status: diaryCount > 0 ? 'available' : 'empty',
      count: diaryCount,
      recent: recentEntries.map(toRecentEntryView),
    },
    tasks: {
      status: openTaskCount > 0 ? 'available' : 'empty',
      openCount: openTaskCount,
      dueTodayCount,
      recent: recentTasks.map(toTaskSummaryView),
    },
    calendar: {
      status: weekEventCount > 0 ? 'available' : 'empty',
      upcomingCount: weekEventCount,
      next: upcomingEvents.map(toEventSummaryView),
    },
    meals: {
      status: orderedTodayMeals.length > 0 || nextMeal ? 'available' : 'empty',
      today: orderedTodayMeals.map(toMealSummaryView),
      next: nextMeal ? toMealSummaryView(nextMeal) : null,
    },
    shopping: {
      status: activeList ? 'available' : 'empty',
      activeList: activeList
        ? {
            id: activeList.id,
            name: activeList.name,
            itemCount: activeList._count.items,
            remaining: activeListRemaining,
          }
        : null,
    },
    inventory: {
      status: inventoryAlertCount > 0 ? 'available' : 'empty',
      lowStockCount: inventoryAlerts.lowStockCount,
      outOfStockCount: inventoryAlerts.outOfStockCount,
      expiringSoonCount: inventoryAlerts.expiringSoonCount,
      expiredCount: inventoryAlerts.expiredCount,
      alerts: inventoryAlerts.alerts,
    },
    recipes: {
      status: recipeCount > 0 ? 'available' : 'empty',
      count: recipeCount,
      favourites: favouriteRecipes.map((recipe) => ({ id: recipe.id, title: recipe.title })),
    },
  };

  for (const moduleName of NOT_AVAILABLE_MODULES) {
    dashboard[moduleName] = { status: 'not_available' };
  }

  return dashboard;
}
