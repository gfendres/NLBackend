# Actions — How to define MCP tools

Actions define operations that go **beyond basic CRUD**. The framework auto-generates `create`, `get`, `list`, `update`, and `delete` tools for every schema — you only need action files for custom behavior.

## Folder structure

Actions are organized in subfolders named after the entity (plural):

```
actions/
├── claude.md           ← you are here
├── recipes/
│   ├── create.md       → tool: recipes_create
│   ├── search.md       → tool: recipes_search
│   └── publish.md      → tool: recipes_publish
└── users/
    └── me.md           → tool: users_me
```

## Tool naming

The tool name is derived from the path: `actions/{entity}/{operation}.md` → `{entity}_{operation}`

You can override with an explicit `**Tool:** custom_name` directive.

## Required sections

### 1. Title (H1 heading)
Human-readable name for the action.

### 2. Directives
- **Auth:** — `Public`, `Authenticated`, or a role name like `Admin only`
- **Tier:** — `1` (deterministic), `2` (cached LLM), or `3` (per-request LLM). Default is 1.

### 3. What it does
Plain-English description of the action's behavior. Be specific enough that an LLM can compile it into steps.

### 4. Input
List of parameters with name, required/optional, and description.

### 5. Output
What the action returns on success.

### 6. Errors
Expected error conditions with codes.

## Example

```markdown
# Search Recipes

**Auth:** Public
**Tier:** 2

## What it does

Searches for recipes matching a query string. Searches across
title, description, tags, and ingredients. Returns results
sorted by relevance.

## Input

- **query** (required): The search string
- **difficulty** (optional): Filter by difficulty level
- **limit** (optional): Max results (default 20)

## Output

Returns a list of matching recipes with pagination metadata.

## Errors

- **invalid_input**: Query is empty or too short
```

## When to create action files

- **Custom search** with logic beyond simple field filtering
- **Multi-entity operations** (e.g., "create recipe and notify followers")
- **Business logic** not covered by CRUD (e.g., "publish recipe")
- **Aggregations** (e.g., "get recipe stats")
- **Tier 3 operations** requiring per-request LLM reasoning

## When NOT to create action files

- Basic CRUD — auto-generated from schemas
- Simple filtered lists — use the auto-generated `_list` tool with filters
- Data validation — put that in `rules/validation.md` instead

## Tier guidelines

| Tier | Use when | Examples |
|------|----------|---------|
| 1 | The operation is fully describable as a sequence of DB reads/writes | Create, update, publish, toggle |
| 2 | Needs one-time LLM interpretation, then the result can be cached | Complex search, data transformation |
| 3 | Needs LLM reasoning on every request | Natural language queries, content generation |
