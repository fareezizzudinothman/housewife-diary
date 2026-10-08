import * as diaryRepository from '../repositories/diaryRepository.js';
import * as taskRepository from '../repositories/taskRepository.js';
import * as calendarRepository from '../repositories/calendarRepository.js';
import * as recipeRepository from '../repositories/recipeRepository.js';
import * as mealRepository from '../repositories/mealRepository.js';
import * as shoppingRepository from '../repositories/shoppingRepository.js';
import * as inventoryRepository from '../repositories/inventoryRepository.js';
import * as financeRepository from '../repositories/financeRepository.js';
import * as familyRepository from '../repositories/familyRepository.js';
import * as homeRepository from '../repositories/homeRepository.js';
import * as documentsRepository from '../repositories/documentsRepository.js';
import * as notesRepository from '../repositories/notesRepository.js';
import * as ideasRepository from '../repositories/ideasRepository.js';

export async function exportHouseholdData(householdId, userId, options = {}) {
  const {
    includeDiary = true,
    includeTasks = true,
    includeCalendar = true,
    includeRecipes = true,
    includeMeals = true,
    includeShopping = true,
    includeInventory = true,
    includeFinance = true,
    includeFamily = true,
    includeHome = true,
    includeDocuments = true,
    includeNotes = true,
    includeIdeas = true,
    format = 'json', // 'json' or 'csv'
  } = options;

  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    household: { id: householdId },
  };

  // Fetch data in parallel for efficiency
  const promises = [];

  if (includeDiary) {
    promises.push(
      diaryRepository.listEntries({ householdId, userId }, { page: 1, limit: 10000 })
        .then(entries => ({ diary: entries }))
    );
  }

  if (includeTasks) {
    promises.push(
      taskRepository.listTasksForExport(householdId)
        .then(tasks => ({ tasks }))
    );
  }

  if (includeCalendar) {
    promises.push(
      calendarRepository.listEventsForExport(householdId)
        .then(events => ({ calendar: events }))
    );
  }

  if (includeRecipes) {
    promises.push(
      recipeRepository.listRecipesForExport(householdId)
        .then(recipes => ({ recipes }))
    );
  }

  if (includeMeals) {
    promises.push(
      mealRepository.listMealsForExport(householdId)
        .then(meals => ({ meals }))
    );
  }

  if (includeShopping) {
    promises.push(
      shoppingRepository.listShoppingForExport(householdId)
        .then(shopping => ({ shopping }))
    );
  }

  if (includeInventory) {
    promises.push(
      inventoryRepository.listInventoryForExport(householdId)
        .then(inventory => ({ inventory }))
    );
  }

  if (includeFinance) {
    promises.push(
      financeRepository.exportFinanceData(householdId)
        .then(finance => ({ finance }))
    );
  }

  if (includeFamily) {
    promises.push(
      familyRepository.exportFamilyData(householdId)
        .then(family => ({ family }))
    );
  }

  if (includeHome) {
    promises.push(
      homeRepository.exportHomeData(householdId)
        .then(home => ({ home }))
    );
  }

  if (includeDocuments) {
    promises.push(
      documentsRepository.listDocumentsForExport(householdId)
        .then(documents => ({ documents: documents.map(d => ({
          ...d,
          // Don't include file content, only metadata
          fileContent: undefined,
        })) }))
    );
  }

  if (includeNotes) {
    promises.push(
      notesRepository.listNotesForExport(householdId, userId)
        .then(notes => ({ notes }))
    );
  }

  if (includeIdeas) {
    promises.push(
      ideasRepository.listIdeasForExport(householdId)
        .then(ideas => ({ ideas }))
    );
  }

  const results = await Promise.all(promises);
  
  // Merge results
  for (const result of results) {
    Object.assign(exportData, result);
  }

  return exportData;
}

export function convertToCSV(exportData) {
  const csvSections = [];

  // Helper to convert array of objects to CSV
  function arrayToCSV(items, fields) {
    if (!items.length) return '';
    const header = fields.join(',');
    const rows = items.map(item => 
      fields.map(field => {
        const value = item[field];
        if (value === null || value === undefined) return '';
        const str = String(value);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      }).join(',')
    );
    return [header, ...rows].join('\n');
  }

  // Add each section as a separate CSV
  if (exportData.diary?.length) {
    csvSections.push('=== DIARY ===');
    csvSections.push(arrayToCSV(exportData.diary, [
      'id', 'title', 'content', 'entryDate', 'timeOfDay', 'mood', 'tags', 'createdAt'
    ]));
    csvSections.push('');
  }

  if (exportData.tasks?.length) {
    csvSections.push('=== TASKS ===');
    csvSections.push(arrayToCSV(exportData.tasks, [
      'id', 'title', 'description', 'status', 'priority', 'dueAt', 'category', 'assignee', 'createdAt'
    ]));
    csvSections.push('');
  }

  if (exportData.calendar?.length) {
    csvSections.push('=== CALENDAR ===');
    csvSections.push(arrayToCSV(exportData.calendar, [
      'id', 'title', 'description', 'startAt', 'endAt', 'allDay', 'category', 'location', 'sourceType', 'sourceId'
    ]));
    csvSections.push('');
  }

  if (exportData.recipes?.length) {
    csvSections.push('=== RECIPES ===');
    csvSections.push(arrayToCSV(exportData.recipes, [
      'id', 'title', 'description', 'servings', 'prepMinutes', 'cookMinutes', 'category', 'cuisine', 'isFavourite'
    ]));
    csvSections.push('');
  }

  if (exportData.meals?.length) {
    csvSections.push('=== MEALS ===');
    csvSections.push(arrayToCSV(exportData.meals, [
      'id', 'date', 'mealType', 'title', 'recipeId', 'notes'
    ]));
    csvSections.push('');
  }

  if (exportData.shopping?.length) {
    csvSections.push('=== SHOPPING ===');
    csvSections.push(arrayToCSV(exportData.shopping, [
      'listId', 'listName', 'itemName', 'quantity', 'unit', 'category', 'purchased'
    ]));
    csvSections.push('');
  }

  if (exportData.inventory?.length) {
    csvSections.push('=== INVENTORY ===');
    csvSections.push(arrayToCSV(exportData.inventory, [
      'id', 'name', 'quantity', 'unit', 'category', 'location', 'expiresAt', 'minimumQuantity'
    ]));
    csvSections.push('');
  }

  if (exportData.finance?.transactions?.length) {
    csvSections.push('=== FINANCE_TRANSACTIONS ===');
    csvSections.push(arrayToCSV(exportData.finance.transactions, [
      'id', 'type', 'status', 'amount', 'currency', 'category', 'account', 'counterAccount', 'date', 'description', 'merchant', 'notes'
    ]));
    csvSections.push('');
  }

  if (exportData.family?.members?.length) {
    csvSections.push('=== FAMILY_MEMBERS ===');
    csvSections.push(arrayToCSV(exportData.family.members, [
      'id', 'name', 'relationship', 'dateOfBirth', 'linkedUserId', 'active', 'notes'
    ]));
    csvSections.push('');
  }

  if (exportData.family?.events?.length) {
    csvSections.push('=== FAMILY_EVENTS ===');
    csvSections.push(arrayToCSV(exportData.family.events, [
      'id', 'memberId', 'title', 'kind', 'eventDate', 'repeatsYearly', 'notes'
    ]));
    csvSections.push('');
  }

  if (exportData.home?.rooms?.length) {
    csvSections.push('=== ROOMS ===');
    csvSections.push(arrayToCSV(exportData.home.rooms, [
      'id', 'name', 'description', 'active'
    ]));
    csvSections.push('');
  }

  if (exportData.home?.cleaning?.length) {
    csvSections.push('=== CLEANING ===');
    csvSections.push(arrayToCSV(exportData.home.cleaning, [
      'id', 'roomId', 'title', 'frequency', 'interval', 'status', 'assignedFamilyMemberId', 'nextDueAt'
    ]));
    csvSections.push('');
  }

  if (exportData.home?.laundry?.length) {
    csvSections.push('=== LAUNDRY ===');
    csvSections.push(arrayToCSV(exportData.home.laundry, [
      'id', 'category', 'status', 'scheduledDate', 'notes'
    ]));
    csvSections.push('');
  }

  if (exportData.home?.maintenance?.length) {
    csvSections.push('=== MAINTENANCE ===');
    csvSections.push(arrayToCSV(exportData.home.maintenance, [
      'id', 'title', 'category', 'roomId', 'scheduledDate', 'priority', 'status', 'description', 'notes'
    ]));
    csvSections.push('');
  }

  if (exportData.documents?.length) {
    csvSections.push('=== DOCUMENTS ===');
    csvSections.push(arrayToCSV(exportData.documents, [
      'id', 'title', 'description', 'category', 'originalName', 'mimeType', 'sizeBytes', 'expiryDate', 'referenceType', 'referenceId', 'createdAt'
    ]));
    csvSections.push('');
  }

  if (exportData.notes?.length) {
    csvSections.push('=== NOTES ===');
    csvSections.push(arrayToCSV(exportData.notes, [
      'id', 'title', 'content', 'category', 'pinned', 'archived', 'tags', 'createdAt', 'updatedAt'
    ]));
    csvSections.push('');
  }

  if (exportData.ideas?.length) {
    csvSections.push('=== IDEAS ===');
    csvSections.push(arrayToCSV(exportData.ideas, [
      'id', 'title', 'description', 'category', 'priority', 'status', 'estimatedCost', 'currency', 'notes', 'createdAt', 'updatedAt'
    ]));
    csvSections.push('');
  }

  return csvSections.join('\n');
}