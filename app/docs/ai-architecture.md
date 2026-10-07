# AI architecture (Phase 10 — planned, not yet implemented)

Status: **design specification**. The AI assistant is deliberately last: it depends on stable, tested application services. Nothing in this document exists in code yet.

## Principles

1. **No direct database access.** The AI layer never holds a Prisma client and never runs SQL.
2. **Same authorization path as users.** AI actions execute through the application services with the requesting user's session context; household isolation and role checks apply automatically.
3. **Allow-listed tools only.** The assistant can call exactly the tools the tool layer exposes — nothing else.
4. **Write actions are deliberate.** Tools that create or modify data return a confirmation to the user in the same conversation; destructive operations are not exposed at all.
5. **Auditable.** Every tool call is recorded with the conversation (who, what, which household, result).

## Layering

```text
User (authenticated, household-scoped)
  ↓
AI Assistant (conversation orchestration)
  ↓
AI Service (provider integration, prompting, safety)
  ↓
Tool Layer (allow-listed, household-scoped)
  ├── reads:  getTasks, getMeals, getInventory, getExpenses, getCalendar,
  │           getShoppingList, getBudgetStatus
  ├── writes: createTask, createShoppingItem, createMeal, createNote
  └── analysis: analyseExpenses, suggestMealPlan, suggestWeeklyClean
  ↓
Application Services (same ones behind the REST API)
  ↓
Repositories → Prisma → PostgreSQL
```

## Tool contract

Each tool: a typed schema (parameters validated like REST input), a service call with the session's `householdId`, and a structured result. Errors surface as tool-result errors the assistant can explain — never as raw exceptions.

## Capabilities (planned)

Ask AI, daily planning, meal suggestions, shopping suggestions (from inventory + meal plan), inventory analysis, expense analysis, household planning, task recommendations, smart reminders.

## Persistence

`ai_conversations` (household-scoped, per user) and `ai_messages` (role, content, tool calls/results). Retention configurable per household.

## Guardrails

- Provider credentials via environment only (`.env.example` placeholder when introduced).
- Per-user rate limits on assistant usage.
- Output is never executed — it is rendered as conversation content.
- The assistant never reveals another household's data (it literally cannot — tools are household-scoped).
