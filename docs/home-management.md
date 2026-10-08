# Home Management

## Overview

The Home Management module provides tools for organizing household spaces, cleaning schedules, laundry tracking, maintenance tasks, and document storage. All features are household-scoped and integrate with Calendar, Tasks, Dashboard, and Finance modules.

## Modules

### Rooms

Define the spaces in your home for organizing cleaning and maintenance.

**Data Model:**
- Name (required, 1-80 chars)
- Description (optional, up to 500 chars)
- Active status

**API Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/home/rooms` | List rooms with pagination, search, active filter |
| POST | `/api/home/rooms` | Create a room |
| GET | `/api/home/rooms/:id` | Get a room |
| PATCH | `/api/home/rooms/:id` | Update a room |
| DELETE | `/api/home/rooms/:id` | Delete (archive) a room |

**Calendar/Task Integration:** None directly, but rooms are referenced by cleaning schedules and maintenance tasks.

### Cleaning Schedules

Recurring cleaning tasks organized by room and frequency.

**Data Model:**
- Room (required)
- Title (required, 1-120 chars)
- Frequency (required): DAILY, WEEKLY, MONTHLY
- Interval (default 1) - every N days/weeks/months
- Status: ACTIVE, PAUSED
- Assigned Family Member (optional)
- Notes (optional, up to 1000 chars)
- Next Due Date (computed)

**Calendar/Task Integration:**
- Cleaning schedules appear in the Home overview page
- Due/overdue status shown in list
- Can generate Tasks for specific cleaning instances

**API Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/home/cleaning` | List cleaning schedules with filters |
| POST | `/api/home/cleaning` | Create a schedule |
| GET | `/api/home/cleaning/:id` | Get a schedule |
| PATCH | `/api/home/cleaning/:id` | Update a schedule |
| DELETE | `/api/home/cleaning/:id` | Delete a schedule |

### Laundry

Track laundry loads through their lifecycle.

**Data Model:**
- Category (required, 1-40 chars) - e.g., Whites, Colors, Delicates
- Status: PENDING, WASHING, DRYING, FOLDED, COMPLETED
- Scheduled Date (optional)
- Notes (optional, up to 500 chars)

**API Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/home/laundry` | List laundry with status/category filters |
| POST | `/api/home/laundry` | Create a laundry load |
| GET | `/api/home/laundry/:id` | Get a laundry load |
| PATCH | `/api/home/laundry/:id` | Update a laundry load |
| DELETE | `/api/home/laundry/:id` | Delete a laundry load |

### Maintenance

Track scheduled and ongoing maintenance tasks.

**Data Model:**
- Title (required, 1-120 chars)
- Category (required, 1-40 chars) - e.g., HVAC, Plumbing, Electrical
- Scheduled Date (required)
- Priority: LOW, MEDIUM, HIGH, URGENT
- Status: OPEN, IN_PROGRESS, COMPLETED, CANCELLED
- Room (optional)
- Description (optional, up to 2000 chars)
- Transaction ID (optional, links to Finance)
- Notes (optional, up to 2000 chars)

**Calendar/Task/Finance Integration:**
- Maintenance items appear in Calendar on their scheduled date
- Can generate a Task from a maintenance item
- Can link to a Finance transaction for cost tracking

**API Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/home/maintenance` | List maintenance with status/room filters |
| POST | `/api/home/maintenance` | Create maintenance |
| GET | `/api/home/maintenance/:id` | Get maintenance |
| PATCH | `/api/home/maintenance/:id` | Update maintenance |
| DELETE | `/api/home/maintenance/:id` | Delete maintenance |
| POST | `/api/home/maintenance/:id/task` | Generate a Task from maintenance |

### Documents

Secure storage for household documents with expiry tracking.

See [documents.md](./documents.md) for detailed documentation.

## Dashboard Integration

The Dashboard Home section shows:
- Room count
- Overdue maintenance count
- Due cleaning schedules count
- Laundry status summary
- Expiring document count

## Frontend Pages

- **home.html** - Overview dashboard with preview cards for each module
- **rooms.html** - Room list with inline create/edit
- **cleaning.html** - Cleaning schedule list with inline create/edit
- **laundry.html** - Laundry list with inline create/edit
- **maintenance.html** - Maintenance list with inline create/edit
- **maintenance-form.html** - Create/edit maintenance form
- **documents.html** - Document list (see documents.md)
- **document-form.html** - Document upload/edit form (see documents.md)

## Household Isolation

All home management data is scoped to the active household.

## Security

- All endpoints require authentication and active household
- CSRF protection on write operations
- Rate limiting on write endpoints (60 req/min)
- Input validation and sanitization
- File upload restrictions (images, PDF, max 5MB)