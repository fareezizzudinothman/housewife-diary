# Documents

## Overview

The Documents module provides secure, private file storage for household documents. Files are encrypted at rest, served through authenticated endpoints, and support expiry tracking and cross-referencing with other modules.

## Features

### Secure Upload
- Files uploaded via raw binary request (not multipart)
- Metadata (title, category, expiry, references) sent as query parameters
- Maximum file size: 5 MB
- Allowed types: JPEG, PNG, WebP, PDF
- File type verified by magic bytes, not extension

### Private Serving
- Files served via authenticated endpoint: `GET /api/documents/:id/file`
- Requires valid session and household membership
- No direct/public URLs
- Supports inline viewing (PDF, images) and download

### Expiry Tracking
- Optional expiry date per document
- Automatic status calculation: ACTIVE, EXPIRING_SOON, EXPIRED
- Dashboard shows expiring document count
- Visual indicators in document list

### Cross-References
Documents can be linked to:
- Maintenance tasks
- Finance transactions
- Inventory items
- Family members

## Data Model

| Field | Type | Constraints |
|-------|------|-------------|
| id | String | UUID, primary key |
| title | String | Required, 1-120 chars |
| description | String | Optional, up to 500 chars |
| category | Enum | INSURANCE, WARRANTY, RECEIPT, CONTRACT, PROPERTY, SCHOOL, MEDICAL, FINANCIAL, OTHER |
| originalName | String | Original filename |
| mimeType | String | JPEG, PNG, WebP, PDF |
| sizeBytes | Integer | Max 5,242,880 (5 MB) |
| expiryDate | Date | Optional |
| expiryStatus | Enum | ACTIVE, EXPIRING_SOON, EXPIRED (computed) |
| referenceType | Enum | MAINTENANCE, FINANCE_TRANSACTION, INVENTORY, FAMILY_MEMBER |
| referenceId | String | Optional, ID of referenced record |
| uploadedBy | User | Reference to uploading user |
| createdAt / updatedAt | DateTime | Timestamps |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/documents` | List with pagination, search, category, status, reference filters |
| POST | `/api/documents` | Upload document (raw body + query params) |
| GET | `/api/documents/:id` | Get document metadata |
| PATCH | `/api/documents/:id` | Update metadata |
| DELETE | `/api/documents/:id` | Delete document and file |
| GET | `/api/documents/:id/file` | Serve file (inline or download) |

### Upload Request Format

```
POST /api/documents?title=Insurance%20Policy&category=INSURANCE&expiryDate=2026-12-31
Headers:
  X-CSRF-Token: <token>
  X-Filename: policy.pdf
  Content-Type: application/pdf
Body: <raw PDF binary>
```

## Frontend Features

- **documents.html** - Searchable, filterable document list
  - Search by title/description
  - Filter by category and expiry status
  - Show file size, expiry date, status badge
  - View, download, edit, delete actions
- **document-form.html** - Upload/edit form
  - File picker with type/size validation
  - Metadata fields
  - Reference linking dropdowns

## Security

### File Type Validation
- Magic byte verification (not extension-based)
- Allowed MIME types: image/jpeg, image/png, image/webp, application/pdf
- Rejects files with mismatched content-type

### Access Control
- Household-scoped: only members of the same household can access
- Authentication required for all endpoints
- Session cookies with SameSite=Lax, HttpOnly
- CSRF protection on write operations

### Storage
- Files stored in filesystem (configured uploads volume)
- Not served by static file server
- Database stores metadata only

## Dashboard Integration

Dashboard shows:
- Total document count
- Expiring soon count (within 30 days)
- Expired count
- Quick link to documents page

## Frontend Pages

- **documents.html** - Document list with filters and actions
- **document-form.html** - Upload new or edit existing document metadata

## Household Isolation

Documents are strictly isolated per household. Users cannot access documents from other households.

## Cleanup

- Deleted documents remove both metadata and file
- No soft delete - permanent removal
- Orphaned files cleaned up on deletion