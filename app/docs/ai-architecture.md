# AI Architecture (Phase 10 — Implemented)

Status: **implemented and tested**. The AI assistant is built on stable, tested application services. All components exist in code and pass the test suite.

## Principles

1. **No direct database access.** The AI layer never holds a Prisma client and never runs SQL.
2. **Same authorization path as users.** AI actions execute through the application services with the requesting user's session context; household isolation and role checks apply automatically.
3. **Allow-listed tools only.** The assistant can call exactly the tools the tool layer exposes — nothing else.
4. **Write actions are deliberate.** Tools that create or modify data return a confirmation to the user in the same conversation; the assistant waits for explicit user confirmation before executing.
5. **Auditable.** Every tool call is recorded with the conversation (who, what, which household, result).

## Layering

```text
User (authenticated, household-scoped)
  ↓
AI Assistant (conversation orchestration) — app/src/server/ai/orchestrator.js
  ↓
AI Service (business logic, conversation CRUD) — app/src/server/services/aiService.js
  ↓
Tool Layer (allow-listed, household-scoped) — app/src/server/ai/tools/
  ├── reads (13): getDashboard, getTasks, getTaskCategories, getCalendar, getMeals,
  │             getShopping, getInventory, getFinanceSummary, getFamily, getHome,
  │             getDocuments, getNotes, getIdeas, getNotifications, getUnreadNotificationCount
  ├── writes (11): createTask, updateTask, completeTask, createCalendarEvent, createMeal,
  │                createShoppingItem, updateInventory, createNote, createIdea,
  │                createFamilyEvent, createMaintenanceItem
  └── base: AITool class, confirmation flow, result formatting
  ↓
Application Services (same ones behind the REST API)
  ↓
Repositories → Prisma → PostgreSQL
```

## Tool Contract

Each tool:
- Extends `AITool` base class with name, description, JSON Schema parameters
- Validates input against schema
- Executes through application services with session's `householdId` and `userId`
- Returns structured result: `{ success, data?, error?, requiresConfirmation?, confirmationPrompt? }`
- Write tools require confirmation; read tools execute directly

Errors surface as tool-result errors the assistant can explain — never as raw exceptions.

## Provider Abstraction

- `AIProvider` base class in `providers.js` defines `generateResponse`, `generateStructuredResponse`, `isAvailable`, `getName`
- `OpenAIProvider` in `openaiProvider.js` implements the interface using OpenAI's Node SDK
- Supports tool calling (function calling) and JSON mode for structured output
- Configurable via environment: `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`), `OPENAI_ORGANIZATION`, timeout

## Capabilities (Implemented)

- **Dashboard overview**: Tasks, meals, inventory alerts, finance summary, upcoming events
- **Task management**: List, create, update, complete with filters and assignment
- **Calendar**: Events, tasks, meals, bills, family events, birthdays, maintenance
- **Meal planning**: View and create meal plan entries
- **Shopping**: Lists, items, recipe/meal-plan import, purchase tracking
- **Inventory**: Items, stock levels, expiry status, purchase/consume/waste/adjust
- **Finance**: Accounts, budgets, bills, transactions summary
- **Family**: Members, events, birthdays
- **Home**: Rooms, cleaning, laundry, maintenance
- **Documents**: Metadata (no file content)
- **Notes**: Search, filter, tag, pin, archive
- **Ideas**: Capture, filter, task generation
- **Notifications**: List, unread count

## Persistence

`ai_conversations` (household-scoped, per user) and `ai_messages` (role: user/assistant/system, content, metadata for tool calls/results). Migration: `20261008101244_add_ai_conversations`.

## Guardrails

- Provider credentials via environment only (`.env.example` placeholder for `OPENAI_API_KEY`).
- Per-user rate limits on assistant usage: 30 req/min for messages, 60 req/min for writes.
- Output is never executed — it is rendered as conversation content.
- The assistant never reveals another household's data (tools are household-scoped).
- Maximum 5 tool iterations per conversation turn to prevent infinite loops.
- Provider timeout: 60 seconds.
- System prompt isolates user content from instructions.
- Input validation on all tool parameters.
- CSRF protection on all write endpoints.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ai/conversations` | List user's conversations |
| POST | `/api/ai/conversations` | Create new conversation |
| GET | `/api/ai/conversations/:id` | Get conversation with messages |
| PATCH | `/api/ai/conversations/:id` | Rename conversation |
| DELETE | `/api/ai/conversations/:id` | Delete conversation |
| POST | `/api/ai/conversations/:id/messages` | Send message, get AI response |
| POST | `/api/ai/conversations/:id/confirm` | Confirm write tool action |
| GET | `/api/ai/status` | Check provider availability |

## Frontend

- **Page**: `app/src/client/pages/ai.html`
- **Script**: `app/src/client/js/pages/ai.js`
- **API Client**: `app/src/client/js/api/ai.js`
- **Features**: Conversation list sidebar, chat interface, loading/error states, confirmation modal, suggestion chips, auto-resize textarea, keyboard shortcuts, theme integration, responsive design.
- **Navigation**: Added to "Your Home" section in sidebar and bottom nav.

## Configuration

Environment variables (in `app/.env`):
```
OPENAI_API_KEY=sk-...           # Required
OPENAI_MODEL=gpt-4o-mini        # Optional
OPENAI_ORGANIZATION=org-...     # Optional
OPENAI_TIMEOUT=30000            # Optional, milliseconds
```

## Security

- All endpoints require authentication (`requireAuth`) and household context (`requireHousehold`)
- Household isolation enforced at service layer — tools never accept `householdId` from the model
- Input validation on all tool parameters (same validators as REST API)
- Tool allowlist prevents arbitrary function calls
- Confirmation flow ensures user intent for all write operations
- No secrets in logs — API keys never logged
- No direct Prisma access from AI layer

## Testing

Run unit/integration tests:
```bash
npm run test
```

All 279 tests pass (existing phases) + AI components are covered by integration through the service layer.

## Usage Examples

### Create a task
```
User: "Create a task to buy groceries due tomorrow"
Assistant: [shows confirmation with task details] → User confirms → Task created
```

### Check inventory
```
User: "What's low in inventory?"
Assistant: [calls get_inventory with stock=low_stock] → Shows results
```

### Plan meals
```
User: "Show me this week's meal plan"
Assistant: [calls get_meals with date range] → Shows meal plan
```

### Create a family event
```
User: "Add mom's birthday on March 15th as a yearly event"
Assistant: [shows confirmation] → User confirms → Event created
```

## Error Handling

The AI returns structured errors:
```json
{
  "success": false,
  "error": {
    "code": "PROVIDER_UNAVAILABLE",
    "message": "AI provider is not available",
    "details": []
  }
}
```

Common error codes:
- `PROVIDER_UNAVAILABLE` (503): OpenAI not configured or unreachable
- `PROVIDER_ERROR` (500): OpenAI API error
- `PROVIDER_TIMEOUT` (504): Request exceeded 60s
- `MAX_ITERATIONS_EXCEEDED`: Too many tool calls
- `CONFIRMATION_REQUIRED`: Write action needs user confirmation
- `CONVERSATION_NOT_FOUND` (404): Invalid conversation ID