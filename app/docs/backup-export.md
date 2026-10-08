# Backup & Export

## Overview

The Backup & Export feature allows households to download a complete backup of their data in JSON or CSV format. This is a one-way export (download only) — import/restore is planned for a future phase.

## Export Format

### JSON Export (Recommended)

The JSON export provides a complete, structured backup of all household data with full fidelity. It includes all modules and preserves relationships.

**Structure:**
```json
{
  "version": "1.0",
  "exportedAt": "2026-10-08T10:30:00.000Z",
  "household": { "id": "..." },
  "diary": [...],
  "tasks": [...],
  "calendar": [...],
  "recipes": [...],
  "meals": [...],
  "shopping": [...],
  "inventory": [...],
  "finance": {
    "accounts": [...],
    "categories": [...],
    "transactions": [...],
    "budgets": [...],
    "bills": [...],
    "recurring": [...]
  },
  "family": {
    "members": [...],
    "events": [...]
  },
  "home": {
    "rooms": [...],
    "cleaning": [...],
    "laundry": [...],
    "maintenance": [...]
  },
  "documents": [...],
  "notes": [...],
  "ideas": [...]
}
```

### CSV Export

The CSV export provides tabular data suitable for spreadsheet analysis. Each module is exported as a separate section within a single CSV file, separated by header comments.

**Structure:**
```
=== DIARY ===
id,title,content,entryDate,timeOfDay,mood,tags,createdAt
...

=== TASKS ===
id,title,description,status,priority,dueAt,category,assignee,createdAt
...

=== FINANCE_TRANSACTIONS ===
id,type,status,amount,currency,category,account,counterAccount,date,description,merchant,notes
...
```

## API Endpoints

### Export Data

```
GET /api/export?format=json&includeDiary=true&includeTasks=true&...
GET /api/export?format=csv&includeFinance=true&includeTasks=false&...
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | `json` \| `csv` | `json` | Export format |
| `includeDiary` | boolean | `true` | Include diary entries |
| `includeTasks` | boolean | `true` | Include tasks |
| `includeCalendar` | boolean | `true` | Include calendar events |
| `includeRecipes` | boolean | `true` | Include recipes |
| `includeMeals` | boolean | `true` | Include meal plans |
| `includeShopping` | boolean | `true` | Include shopping lists |
| `includeInventory` | boolean | `true` | Include inventory |
| `includeFinance` | boolean | `true` | Include finance data |
| `includeFamily` | boolean | `true` | Include family members/events |
| `includeHome` | boolean | `true` | Include home management data |
| `includeDocuments` | boolean | `true` | Include document metadata |
| `includeNotes` | boolean | `true` | Include notes |
| `includeIdeas` | boolean | `true` | Include ideas |

**Response:**

- `format=json`: Returns JSON with `Content-Type: application/json` and `Content-Disposition: attachment`
- `format=csv`: Returns CSV with `Content-Type: text/csv` and `Content-Disposition: attachment`

**Filename Format:** `housewife-diary-export-YYYY-MM-DD.json` or `.csv`

## Frontend

### Export Page (`/pages/export.html`)

- Format selection (JSON/CSV)
- Granular module selection with checkboxes
- All modules selected by default
- One-click download
- Progress feedback via toast notifications
- Responsive design

### Security

- Export only includes data from the active household
- Authentication required (valid session + active household)
- No passwords, session tokens, or secrets included
- Document files NOT included (only metadata)
- Binary document backup deferred

## Data Included by Module

| Module | Data Included | Notes |
|--------|---------------|-------|
| Diary | Entries, moods, tags, attachments (metadata only) | Content included, file content excluded |
| Tasks | Tasks, categories, recurrence rules | Series heads + occurrences |
| Calendar | Native events + recurrence rules | Derived items (tasks, meals, bills) NOT included |
| Recipes | Recipes, ingredients, favourites | Instructions included |
| Meals | Meal plan entries, recipe references | Title snapshots preserved |
| Shopping | Lists, items, purchase status | Recipe/meal import history |
| Inventory | Items, transactions, expiry dates | Full ledger history |
| Finance | Accounts, categories, transactions, budgets, bills, recurring rules, receipts (metadata) | Receipt files NOT included |
| Family | Members, events, linked users | Birthdays derived from member data |
| Home | Rooms, cleaning, laundry, maintenance | Cross-references preserved |
| Documents | Metadata only (no file content) | Expiry status, cross-references |
| Notes | Notes, tags, pin/archive status | Created by current user only |
| Ideas | Ideas, priority, status, cost estimates | Task link preserved |

## Security Considerations

1. **Household Isolation**: Export only includes data from the active household
2. **Authentication**: Requires valid session with active household
3. **No Secrets**: Passwords, session tokens, CSRF tokens, API keys excluded
4. **File Content**: Document/receipt files NOT included (metadata only)
5. **Authorization**: Only household members can export; role doesn't matter
6. **Audit**: Export action logged (future enhancement)

## File Size Estimates

| Household Size | JSON (approx) | CSV (approx) |
|----------------|---------------|--------------|
| Small (1-2 users, light usage) | 50-200 KB | 20-100 KB |
| Medium (3-4 users, regular usage) | 200 KB - 2 MB | 100 KB - 1 MB |
| Large (5+ users, heavy usage) | 2-10 MB | 1-5 MB |

## Frontend Usage

1. Navigate to **Settings → Export Data**
2. Select format (JSON recommended for backup, CSV for analysis)
3. Select modules to include (all selected by default)
4. Click **Generate Export**
3. Browser downloads file automatically

## Restore / Import

**Status: Deferred to future phase**

Planned features for future implementation:
- JSON import with schema validation
- Dry-run preview before applying
- Conflict resolution (skip / merge / replace)
- Selective module restore
- Cross-household import protection
- Schema version validation
- Dry-run validation before applying

**Safety First**: Automatic restore is intentionally deferred. The export format is designed to be forward-compatible so future import tools can handle current exports.

## Backup Best Practices

1. **Regular Exports**: Export weekly or before major changes
2. **Multiple Copies**: Store exports in multiple locations (local, cloud, external drive)
3. **Version Tracking**: Keep dated exports to track changes over time
4. **Test Restore**: When import is available, test with a copy first
5. **Document Files**: Separately backup document files from the uploads volume

## Deferred Features

- Automated scheduled exports
- Incremental/differential exports
- Encrypted exports (password-protected)
- Cloud storage integration (Google Drive, Dropbox, etc.)
- Automated restore with validation
- Selective field export (GDPR compliance)
- Export scheduling via cron/calendar