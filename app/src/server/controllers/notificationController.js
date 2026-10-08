import * as notificationService from '../services/notificationService.js';

export async function listNotifications(req, res, next) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, unreadOnly, includeArchived } = req.query;

    const result = await notificationService.listNotifications(userId, {
      page: Number(page),
      limit: Number(limit),
      unreadOnly: unreadOnly === 'true',
      includeArchived: includeArchived === 'true',
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getUnreadCount(req, res, next) {
  try {
    const userId = req.user.id;
    const count = await notificationService.getUnreadCount(userId);
    res.json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
}

export async function markRead(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await notificationService.markRead(id, userId);
    res.json({ success: true, data: { id, read: true } });
  } catch (error) {
    next(error);
  }
}

export async function markAllRead(req, res, next) {
  try {
    const userId = req.user.id;
    await notificationService.markAllRead(userId);
    res.json({ success: true, data: { markedAllRead: true } });
  } catch (error) {
    next(error);
  }
}

export async function archiveNotification(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await notificationService.archiveNotification(id, userId);
    res.json({ success: true, data: { id, archived: true } });
  } catch (error) {
    next(error);
  }
}

export async function deleteNotification(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await notificationService.deleteNotification(id, userId);
    res.json({ success: true, data: { id, deleted: true } });
  } catch (error) {
    next(error);
  }
}

export async function triggerGenerate(req, res, next) {
  try {
    const { householdId } = req.user;
    // Only allow admin/owner to trigger
    if (!['OWNER', 'ADMIN'].includes(req.householdRole)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient role to trigger notification generation.' },
      });
    }
    const result = await notificationService.generateNotificationsForHousehold(householdId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}