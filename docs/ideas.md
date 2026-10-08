# Ideas

## Overview

The Ideas module is a lightweight capture tool for household ideas, wishlist items, and potential projects. Each idea has a title, optional description, category, priority, status, estimated cost, and optional link to create a Task.

## Ideas vs Tasks

| Feature | Ideas | Tasks |
|---------|-------|-------|
| Purpose | Capture, prioritize, incubate | Actionable, scheduled, completable |
| Status flow | IDEA → PLANNED → IN_PROGRESS → COMPLETED/CANCELLED | TODO → IN_PROGRESS → COMPLETED/CANCELLED |
| Due dates | No | Yes |
| Recurrence | No | Yes |
| Assignees | No | Yes |
| Cost tracking | Estimated cost only | No (linked to Finance) |
| Task linking | Can generate Task | N/A |

## Data Model

| Field | Type | Constraints |
|-------|------|-------------|
| id | String | UUID, primary key |
| title | String | Required, 1-200 chars |
| description | String | Optional, up to 5,000 chars |
| category | String | Optional, up to 100 chars |
| priority | Enum | LOW, MEDIUM, HIGH, URGENT (default MEDIUM) |
| status | Enum | IDEA, PLANNED, IN_PROGRESS, COMPLETED, CANCELLED (default IDEA) |
| estimatedCost | Decimal | Optional, up to 999,999,999,999.99 |
| currency | String | ISO 4217 code, 3 letters (default SGD) |
| notes | String | Optional, up to 2,000 chars |
| createdBy | User | Reference |
| createdAt / updatedAt | DateTime | Timestamps |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ideas` | List with pagination, search, category, status filters |
| POST | `/api/ideas` | Create an idea |
| GET | `/api/ideas/:id` | Get an idea |
| PATCH | `/api/ideas/:id` | Update an idea (partial) |
| DELETE | `/api/ideas/:id` | Delete an idea |
| POST | `/api/ideas/:id/task` | Generate a Task from this idea |

### Query Parameters (List)
- `page`, `limit` - Pagination (default 20)
- `search` - Search title and description (up to 100 chars)
- `category` - Filter by exact category match
- `status` - Filter by status enum

## Task Linking

When generating a Task from an Idea:
- Task title = Idea title
- Task notes = Idea description + notes
- Task category = Idea category
- Task priority = Idea priority
- Idea status automatically set to PLANNED
- Original idea preserved for reference

## Frontend Features

### ideas.html
- Searchable, paginated list
- Filter by category and status
- Priority chips (color-coded)
- Status badges
- Estimated cost display with currency
- Create Task button per idea
- Edit/delete actions

### idea-form.html
- Title (required)
- Description (optional, large textarea)
- Category (optional)
- Priority dropdown
- Status dropdown
- Estimated cost input with currency selector
- Notes (optional)

## Dashboard Integration

Dashboard does not currently show ideas summary.

## Security

- Household-scoped
- CSRF protection on write operations
- Rate limiting: 120 req/min on writes
- Input validation:
  - Title: 1-200 chars
  - Description: up to 5,000 chars
  - Category: up to 100 chars
  - Priority: enum validation
  - Status: enum validation
  - Estimated cost: decimal, max 999,999,999,999.99, 2 decimal places
  - Currency: ISO 4217 3-letter code
  - Notes: up to 2,000 chars

## Household Isolation

Ideas are strictly isolated per household.

## Deferred Features

Intentionally not implemented:
- Idea comments/discussion
- Idea voting/ranking
- Sub-ideas/hierarchy
- Idea templates
- Automatic scheduling from ideas
- Budget integration beyond cost estimate
- Collaboration features