# Notifications

## Overview

The Notifications module provides an in-app notification center for Housewife Diary. Notifications are generated from existing domain events (tasks, bills, inventory, documents, family events, maintenance) and presented to users within the application. No email or push notifications are sent in this phase.

## Notification Types

| Type | Source | Description |
|------|--------|-------------|
| `TASK_DUE` | Tasks | A task assigned to the user is due today |
| `TASK_OVERDUE` | Tasks | A task assigned to the user is past due |
| `BILL_DUE` | Finance Bills | A bill is due within the next 7 days |
| `BILL_OVERDUE` | Finance Bills | A bill is past due |
| `INVENTORY_EXPIRING` | Inventory | An inventory item expires within 7 days |
| `INVENTORY_EXPIRED` | Inventory | An inventory item has expired |
| `DOCUMENT_EXPIRING` | Documents | A document expires within 30 days |
| `DOCUMENT_EXPIRED` | Documents | A document has expired |
| `FAMILY_BIRTHDAY` | Family | A family member's birthday or event within 7 days |
| `MAINTENANCE_DUE` | Home Maintenance | A maintenance item is scheduled within 7 days |

## Data Model

```prisma
enum NotificationType {
  TASK_DUE
  TASK_OVERDUE
  BILL_DUE
  BILL_OVERDUE
  INVENTORY_EXPIRING
  INVENTORY_EXPIRED
  DOCUMENT_EXPIRING
  DOCUMENT_EXPIRED
  FAMILY_BIRTHDAY
  MAINTENANCE_DUE
}

model Notification {
  id          String          @id @default(cuid())
  householdId String          @map("household_id")
  userId      String          @map("user_id")
  type        NotificationType
  title       String
  message     String?
  sourceType  String          @map("source_type")
  sourceId    String          @map("source_id")
  dedupeKey   String          @map("dedupe_key")
  readAt      DateTime?       @map("read_at")
  archivedAt  DateTime?       @map("archived_at")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, dedupeKey])
  @@index([userId, readAt])
  @@index([userId, createdAt(sort: Desc)])
  @@index([householdId, type])
  @@map("notifications")
}
```

## Deduplication

Notifications are deduplicated per user using a `dedupeKey` composed of:
```
hd_notif_v1:{type}:{sourceType}:{sourceId}
```

This ensures that the same event (e.g., a specific bill becoming overdue) only generates one notification per user, even if the notification generation runs multiple times.

## API Endpoints

All endpoints require authentication and an active household.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | List notifications with pagination and filters |
| GET | `/api/notifications/unread-count` | Get count of unread notifications |
| POST | `/api/notifications/read-all` | Mark all notifications as read |
| POST | `/api/notifications/:id/read` | Mark a specific notification as read |
| POST | `/api/notifications/:id/archive` | Archive a notification |
| DELETE | `/api/notifications/:id` | Delete a notification |
| POST | `/api/notifications/generate` | Trigger notification generation for household (admin/owner only) |

### Query Parameters (List)

- `page` (default: 1)
- `limit` (default: 20, max: 100)
- `unreadOnly` (boolean) - show only unread notifications
- `includeArchived` (boolean) - include archived notifications

## Frontend Features

### Notification Center (`/pages/notifications.html`)
- Paginated, filterable list of notifications
- Unread badge in topbar
- Mark as read / mark all read
- Archive / delete actions
- Filter by read status and archived status
- Responsive design (375px - 1360px)

### Topbar Integration
- Notification bell icon with unread count badge
- Dropdown menu link to notification center
- Real-time unread count updates

## Notification Generation

Notifications are generated from existing domain data on-demand (via `/api/notifications/generate` endpoint). In production, this would be run as a scheduled cron job or background job. The generation logic:

1. Queries relevant domain data (tasks, bills, inventory, documents, family, maintenance)
2. For each user in the household, checks for relevant events
3. Creates notifications with deduplication keys to prevent duplicates
4. Returns count of generated notifications

## Security

- All endpoints require authentication and active household
- Household isolation: users only see notifications for their active household
- CSRF protection on write operations
- Rate limiting on write endpoints (60 req/min)
- Users only see their own notifications (scoped by userId)

## Deferred Features

- Email/push notification delivery (Phase 9+)
- Notification preferences per type
- Rich notification content (actions, deep links)
- Notification grouping/summaries
- Real-time updates via WebSockets
- Notification history/retention policies