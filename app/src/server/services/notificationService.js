import * as notificationRepository from '../repositories/notificationRepository.js';

export async function listNotifications(userId, params = {}) {
  return notificationRepository.listNotifications(userId, params);
}

export async function getUnreadCount(userId) {
  return notificationRepository.countUnread(userId);
}

export async function markRead(notificationId, userId) {
  return notificationRepository.markRead(notificationId, userId);
}

export async function markAllRead(userId) {
  return notificationRepository.markAllRead(userId);
}

export async function archiveNotification(notificationId, userId) {
  return notificationRepository.archiveNotification(notificationId, userId);
}

export async function deleteNotification(notificationId, userId) {
  return notificationRepository.deleteNotification(notificationId, userId);
}

export async function getNotificationById(notificationId, userId) {
  return notificationRepository.getNotificationById(notificationId, userId);
}

// Generate notifications from domain data
// This is called by a scheduled job or on-demand
export async function generateNotificationsForHousehold(householdId) {
  // This would be called by a cron job
  // For Phase 9, we implement a basic version that can be triggered manually
  // A production system would use a job queue
  const users = await notificationRepository.listActiveUsersWithHousehold();
  const householdUsers = users.filter(u => u.activeHouseholdId === householdId);
  
  // For now, return a simple result
  // Full implementation would iterate through each user and generate notifications
  // using the notification generation functions
  return { generated: 0, users: householdUsers.length };
}