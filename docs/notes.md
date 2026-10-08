# Notes

## Overview

The Notes module provides a simple, flexible note-taking system for personal and household reference. Notes support tagging, pinning, archiving, and full-text search. Unlike Diary entries (which are date-based), Notes are topic-based reference material.

## Notes vs Diary

| Feature | Notes | Diary |
|---------|-------|-------|
| Organization | Topic/category + tags | Date-based (one per day) |
| Purpose | Reference, lists, permanent info | Daily journal, mood tracking |
| Pinning | Yes | No |
| Archiving | Yes | No (always accessible by date) |
| Attachments | No | Yes (images) |
| Mood tracking | No | Yes |

## Data Model

| Field | Type | Constraints |
|-------|------|-------------|
| id | String | UUID, primary key |
| title | String | Required, 1-200 chars |
| content | String | Required, 1-20,000 chars (plain text) |
| category | String | Optional, up to 100 chars |
| tags | Array[String] | Up to 10 tags, each 1-40 chars |
| pinned | Boolean | Default false |
| archived | Boolean | Default false |
| createdBy | User | Reference |
| createdAt / updatedAt | DateTime | Timestamps |

### Content Handling
- Stored as plain text (no HTML/Markdown rendering)
- Line breaks preserved
- URLs auto-linked in display
- XSS prevention via textContent rendering
- Control characters stripped (except tab, newline, carriage return)

### Tags
- Max 10 tags per note
- Each tag: 1-40 chars, no control characters
- Case-insensitive deduplication
- Comma/Enter separated input in UI

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notes/tags` | List all unique tags in household |
| GET | `/api/notes` | List with pagination, search, category, tag, pinned, archived filters |
| POST | `/api/notes` | Create a note |
| GET | `/api/notes/:id` | Get a note |
| PATCH | `/api/notes/:id` | Update a note (partial) |
| DELETE | `/api/notes/:id` | Delete a note |

### Query Parameters (List)
- `page`, `limit` - Pagination
- `search` - Search title and content (up to 100 chars)
- `category` - Filter by exact category match
- `tag` - Filter by tag (exact match)
- `pinned` - true/false/undefined
- `archived` - true/false/undefined

## Frontend Features

### notes.html
- Searchable, paginated list
- Filter by category, tag, pinned, archived
- Inline tag chips display
- Pin/unpin toggle button
- Archive/unarchive toggle button
- Delete with confirmation
- Pinned notes appear at top (visual indicator)

### note-form.html
- Title input (required)
- Content textarea (required, plain text)
- Category input (optional)
- Tag input with chip display (comma/Enter to add)
- Pin checkbox
- Archive checkbox
- Tag chips show existing household tags for quick selection

## Dashboard Integration

Dashboard does not currently show notes summary (intentionally minimal).

## Search

- Full-text search across title and content
- Tag filter for exact tag matches
- Category filter for exact category matches
- Combined filters supported

## Security

- Household-scoped
- CSRF protection on write operations
- Rate limiting: 120 req/min on writes
- Input validation:
  - Title: 1-200 chars
  - Content: 1-20,000 chars (normalized)
  - Category: up to 100 chars
  - Tags: max 10, each 1-40 chars, no control chars
- XSS prevention: content rendered via textContent, never innerHTML

## Household Isolation

Notes are strictly isolated per household. Users cannot access notes from other households.

## Deferred Features

Intentionally not implemented:
- Rich text editing (Markdown/HTML)
- Note sharing between households
- Note versioning/history
- Nested folders/notebooks
- Reminders/alerts on notes