# AI Assistant

## Overview

The AI Assistant is a conversational interface that helps users manage their household by leveraging the existing application services. It uses an OpenAI provider with function calling to execute read and write operations on household data.

## Architecture

### Components

1. **Provider Abstraction** (`app/src/server/ai/providers.js`)
   - `AIProvider` base class defining the interface
   - `OpenAIProvider` implementation using OpenAI's API
   - Supports `generateResponse` (text + tool calls) and `generateStructuredResponse` (JSON mode)

2. **Tools** (`app/src/server/ai/tools/`)
   - **Base** (`base.js`): `AITool` class, confirmation flow, result formatting
   - **Read Tools** (`readTools.js`, `readToolsPart1.js`): 13 tools for querying data
   - **Write Tools** (`writeTools.js`): 11 tools for creating/updating data (require confirmation)

3. **Orchestrator** (`app/src/server/ai/orchestrator.js`)
   - Conversation loading & message persistence
   - Context building with household/user context
   - Provider invocation with tool calling
   - Tool execution with confirmation handling
   - Maximum iteration limit (5) to prevent infinite loops
   - Timeout handling (60s)

4. **Service Layer** (`app/src/server/services/aiService.js`)
   - Conversation CRUD operations
   - Message sending and processing
   - Confirmation handling

5. **API Routes** (`app/src/server/routes/ai.routes.js`)
   - `GET /api/ai/conversations` - List conversations
   - `POST /api/ai/conversations` - Create conversation
   - `GET /api/ai/conversations/:id` - Get conversation with messages
   - `PATCH /api/ai/conversations/:id` - Rename conversation
   - `DELETE /api/ai/conversations/:id` - Delete conversation
   - `POST /api/ai/conversations/:id/messages` - Send message
   - `POST /api/ai/conversations/:id/confirm` - Confirm write action
   - `GET /api/ai/status` - Provider availability check

6. **Frontend** (`app/src/client/pages/ai.html`, `app/src/client/js/pages/ai.js`)
   - Conversation list sidebar
   - Chat interface with message history
   - Real-time loading states
   - Confirmation modal for write operations
   - Suggestion chips for common queries
   - Mobile-responsive design

### Data Models

**AIConversation** (Prisma)
- `id`: CUID
- `householdId`: Foreign key to Household
- `userId`: Foreign key to User
- `title`: String
- `createdAt`, `updatedAt`: DateTime

**AIMessage** (Prisma)
- `id`: CUID
- `conversationId`: Foreign key to AIConversation
- `role`: "user" | "assistant" | "system"
- `content`: String
- `metadata`: JSON (tool calls, usage, etc.)
- `createdAt`: DateTime

## Tools

### Read Tools (13)

| Tool | Description |
|------|-------------|
| `get_dashboard` | Household dashboard overview |
| `get_tasks` | Tasks with filters (status, priority, assignee, date range) |
| `get_task_categories` | Task categories |
| `get_calendar` | Calendar events (includes tasks, meals, bills, family events) |
| `get_meals` | Meal plan entries |
| `get_shopping` | Shopping lists and items |
| `get_inventory` | Inventory items with filters |
| `get_finance_summary` | Finance accounts, budgets, bills, transactions |
| `get_family` | Family members and events |
| `get_home` | Rooms, cleaning, laundry, maintenance |
| `get_documents` | Document metadata |
| `get_notes` | Notes with filters |
| `get_ideas` | Ideas with filters |
| `get_notifications` | User notifications |
| `get_unread_notification_count` | Unread notification count |

### Write Tools (11)

| Tool | Description | Confirmation |
|------|-------------|--------------|
| `create_task` | Create a new task | Yes |
| `update_task` | Update an existing task | Yes |
| `complete_task` | Mark task as completed | Yes |
| `create_calendar_event` | Create calendar event | Yes |
| `create_meal` | Create meal plan entry | Yes |
| `create_shopping_item` | Add item to shopping list | Yes |
| `update_inventory` | Purchase/consume/waste/adjust stock | Yes |
| `create_note` | Create a note | Yes |
| `create_idea` | Create an idea | Yes |
| `create_family_event` | Create family event | Yes |
| `create_maintenance_item` | Create maintenance job | Yes |

All write tools:
- Validate input parameters
- Verify user authentication and household scope
- Present confirmation prompt with action details
- Execute exactly once after explicit confirmation
- Return normalized result

## Security

- **Household isolation**: All operations scoped to `req.householdId`
- **Authentication required**: All endpoints require valid session
- **CSRF protection**: Double-submit pattern for unsafe methods
- **Rate limiting**: Per-endpoint limiters (30 req/min for messages, 60 req/min for writes)
- **Input validation**: Server-side validation for all parameters
- **Prompt injection defense**: System prompt isolates user content
- **Tool allowlist**: Only registered tools can be called
- **Maximum iterations**: 5 tool calls per conversation turn
- **Provider timeout**: 60 seconds
- **No secrets in logs**: API keys never logged
- **No direct DB access**: Tools call application services only
- **No arbitrary shell/fs access**: Sandboxed execution

## Frontend Features

- **Conversation list**: Sidebar with search, create, rename, delete
- **Chat view**: Message bubbles with user/assistant distinction
- **Loading states**: Spinner during provider calls
- **Error states**: Retry button with error details
- **Confirmation modal**: Shows action details before execution
- **Suggestion chips**: Common queries to get started
- **Auto-resize textarea**: Grows with content
- **Keyboard shortcuts**: Enter to send, Shift+Enter for newline
- **Theme integration**: Uses existing theme engine
- **Responsive**: Collapsible sidebar on mobile

## Configuration

Environment variables:
- `OPENAI_API_KEY`: Required for OpenAI provider
- `OPENAI_MODEL`: Optional (default: `gpt-4o-mini`)
- `OPENAI_ORGANIZATION`: Optional
- `OPENAI_TIMEOUT`: Optional (default: 30000ms)

## Usage Examples

### Create a task
```
User: "Create a task to buy groceries due tomorrow"
Assistant: [shows confirmation] → User confirms → Task created
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

## Testing

Run unit/integration tests:
```bash
npm run test
```

Test coverage includes:
- Provider: configured/unavailable/error/timeout
- Tools: valid/invalid input, auth, household isolation, confirmation
- Orchestrator: normal response, read/write tools, confirmation flow, max iterations
- Security: cross-household access, forged IDs, prompt injection, CSRF
- Conversation: create, list, retrieve, delete, message persistence