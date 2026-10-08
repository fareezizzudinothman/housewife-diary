# Family Management

## Overview

The Family module allows users to manage family members and family events within a household. It integrates with the Calendar module for birthday and event tracking, and with the Dashboard for quick overview.

## Family Members

### Data Model

Each family member has:
- **Name** (required, 1-80 chars)
- **Relationship** (required, 1-40 chars) - e.g., Spouse, Child, Parent, Sibling
- **Date of Birth** (optional, YYYY-MM-DD) - enables automatic birthday calendar events
- **Linked User** (optional) - links to a household user account for automatic calendar integration
- **Notes** (optional, up to 1000 chars) - medical info, preferences, etc.
- **Active Status** - archived members are hidden from active lists but preserved

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/family/meta` | Get metadata (member counts, etc.) |
| GET | `/api/family/members` | List members with pagination, search, archived filter |
| POST | `/api/family/members` | Create a new member |
| GET | `/api/family/members/:id` | Get a specific member |
| PATCH | `/api/family/members/:id` | Update a member |
| DELETE | `/api/family/members/:id` | Archive a member (soft delete) |

### Frontend Pages

- **family.html** - Main family page with member list and event list
- **family-member-form.html** - Create/edit family member form

## Family Events

### Data Model

Each family event has:
- **Title** (required, 1-120 chars)
- **Kind** (required, 1-40 chars) - e.g., Birthday, Anniversary, Holiday
- **Event Date** (required, YYYY-MM-DD)
- **Member** (optional) - links to a family member
- **Repeats Yearly** (boolean) - for recurring annual events
- **Notes** (optional, up to 1000 chars)

### Calendar Integration

Family events automatically appear in the Calendar module:
- Events with a linked member show the member's name
- Yearly repeating events appear on the same date each year
- Member birthdays (from dateOfBirth) also appear as yearly calendar events

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/family/events` | List events with date range and member filters |
| POST | `/api/family/events` | Create a new event |
| GET | `/api/family/events/:id` | Get a specific event |
| PATCH | `/api/family/events/:id` | Update an event |
| DELETE | `/api/family/events/:id` | Delete an event |

## Birthday Handling

When a family member has a `dateOfBirth`:
1. A birthday event is automatically created in the Calendar for the current/next year
2. If `repeatsYearly` is enabled on a Birthday event, it recurs annually
3. The Dashboard shows upcoming birthdays with age calculation

## Household Isolation

Family data is scoped to the active household. Users in different households cannot see each other's family members or events.

## Frontend Features

- Searchable, paginated member list
- Inline create/edit via modal dialogs
- Archive/restore members
- Filter events by date range and member
- Responsive design for mobile/desktop
- Keyboard accessible, proper ARIA labels

## Security

- All endpoints require authentication and active household
- CSRF protection on write operations
- Rate limiting on write endpoints (60 req/min)
- Input validation and sanitization