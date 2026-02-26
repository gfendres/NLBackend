# NLBackend

**Define backends in natural language. Run them via MCP.**

NLBackend is a framework where you describe your data models, business rules, actions, and workflows in plain Markdown files — and the framework turns them into a fully functional API that LLMs can interact with through the [Model Context Protocol](https://modelcontextprotocol.io/).

No code. Just natural language.

```
schema/user.md          →  users_create, users_get, users_list, users_update, users_delete
schema/recipe.md        →  recipes_create, recipes_get, recipes_list, ...
rules/permissions.md    →  enforced on every operation
workflows/publish.md    →  run_workflow("publish")
```

## How it works

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Project (Markdown)                 │
│  schema/*.md   actions/*.md   rules/*.md   workflows/*.md   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  NLBackend  │  ← compiles schemas, registers tools
                    │  MCP Server │  ← file-based DB, auto CRUD
                    └──────┬──────┘
                           │ stdio (MCP protocol)
                    ┌──────▼──────┐
                    │  Claude /   │  ← calls users_create, query_db, etc.
                    │  Any LLM    │
                    └─────────────┘
```

**Two LLM roles:**
- **Building LLM** — reads `claude.md` files, writes `.md` definitions. Builds the backend.
- **Consuming LLM** — connects via MCP, calls tools, reads/writes data. Uses the backend.

## Quick start

### Prerequisites

[Bun](https://bun.sh) v1.0+:

```bash
curl -fsSL https://bun.sh/install | bash
```

### Install & create a project

```bash
git clone https://github.com/your-org/nlbackend.git
cd nlbackend
bun install

# Scaffold a new project
bun run src/cli.ts init my-app
```

### Define your data model

Create `my-app/schema/task.md`:

```markdown
# Task

A task in a to-do list.

## Fields

- **id**: string, auto uuid, immutable
- **title**: string, required, min 1, max 200
- **done**: boolean, default false
- **created_at**: string, auto timestamp, immutable
- **updated_at**: string, auto timestamp
```

That's it. The framework auto-generates `tasks_create`, `tasks_get`, `tasks_list`, `tasks_update`, and `tasks_delete` tools.

### Start the server

```bash
bun run src/index.ts ./my-app
```

### Connect an LLM

```bash
bun run src/cli.ts config ./my-app
```

This outputs the MCP config JSON. Paste it into your client:

**Claude Desktop** (`~/.claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "my-app": {
      "command": "bun",
      "args": ["run", "/path/to/nlbackend/src/index.ts", "/path/to/my-app"]
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`): same format.

The LLM can now call `tasks_create`, `tasks_list`, `query_db`, and all other tools.

## Project structure

```
my-app/
├── project.md              # Name & description
├── claude.md               # Instructions for the Building LLM
├── schema/                 # Data models (one .md per entity)
│   └── claude.md           # Conventions for writing schemas
├── actions/                # Custom MCP tools beyond CRUD
│   └── claude.md
├── rules/                  # Business rules & validation
│   └── claude.md
├── workflows/              # Multi-step processes (saga pattern)
│   └── claude.md
├── integrations/           # External service configs (email, webhooks)
│   └── claude.md
├── config/server.md        # LLM provider settings
├── tests/                  # Natural language test scenarios
│   └── claude.md
└── db/                     # Auto-managed file database
```

Every folder has a `claude.md` that teaches an LLM how to write files for that folder. Share the project with Claude and describe what you want — it knows the conventions.

## What you get automatically

| You write | Framework provides |
|-----------|--------------------|
| `schema/user.md` | `users_create`, `users_get`, `users_list`, `users_update`, `users_delete` |
| `schema/recipe.md` | Same 5 CRUD tools for recipes |
| `actions/recipes/search.md` | Custom `recipes_search` tool |
| `rules/permissions.md` | Enforced business rules |
| `workflows/publish.md` | `run_workflow("publish")` |
| Nothing | `describe_api`, `query_db`, `mutate_db`, `inspect`, `compile`, `explain`, `run_workflow` |

## Schema keywords

Schemas are compiled with a rule-based parser (no LLM needed). Use these recognized keywords:

| Keyword | Example |
|---------|---------|
| `required` | `- **title**: string, required` |
| `optional` | `- **bio**: string, optional` |
| `default` | `- **role**: string, enum viewer/editor/admin, default "editor"` |
| `enum` | `- **status**: string, enum draft/published/archived` |
| `min` / `max` | `- **rating**: integer, min 1, max 5` |
| `unique` | `- **email**: string, required, unique` |
| `indexed` | `- **username**: string, indexed` |
| `reference to` | `- **author_id**: string, required, reference to User` |
| `auto uuid` | `- **id**: string, auto uuid, immutable` |
| `auto timestamp` | `- **created_at**: string, auto timestamp, immutable` |
| `auto increment` | `- **version**: integer, auto increment` |
| `immutable` | Cannot be changed after creation |

## System tools

These are always available on every NLBackend server:

| Tool | Purpose |
|------|---------|
| `describe_api` | Returns all schemas, tools, and compilation status |
| `query_db` | Read with filters, sorting, pagination |
| `mutate_db` | Low-level create/update/delete |
| `inspect` | View compiled state of any schema, action, rule, or workflow |
| `compile` | Trigger LLM compilation of actions/rules/workflows |
| `explain` | Dry-run — shows what would happen without executing |
| `run_workflow` | Execute a multi-step workflow |

## MCP resources

The server exposes read-only resources for the consuming LLM:

| Resource URI | Content |
|-------------|---------|
| `nlbackend://project` | Full project overview, data model, available tools, getting-started guide |
| `nlbackend://schema/{entity}` | Detailed schema for a specific entity |

## CLI

```bash
nlbackend <project-path>              # Start the MCP server
nlbackend <project-path> --compile    # Start with LLM compilation
nlbackend init [<folder>]             # Create a new project from template
nlbackend config [<project-path>]     # Output MCP client connection config
nlbackend test [<project-path>]       # Run .test.md natural language tests
nlbackend version                     # Print version
```

## Advanced features

### Actions (custom tools)

For operations beyond CRUD, create action files in `actions/{entity}/`:

```markdown
# Search Recipes

> Tier: 2
> Auth: public

Searches recipes by keyword, cuisine, or ingredients.

## Input
- **query**: string, optional — keyword search
- **cuisine**: string, optional — filter by cuisine type
- **max_time**: integer, optional — max cooking time in minutes

## Output
Returns matching recipes sorted by relevance.
```

Actions are LLM-compiled into execution plans. Requires `ANTHROPIC_API_KEY` and `--compile` flag.

### Rules

Define business rules in `rules/*.md`:

```markdown
# Permissions

## Only owners can edit
A user can only update or delete a recipe if they are the author.

## Admin override
Users with role "admin" can update or delete any record.
```

### Workflows

Multi-step processes with saga-pattern compensation:

```markdown
# Publish Recipe

## Trigger
When a recipe's status changes to "published".

## Steps
1. Validate all required fields are present
2. Generate a URL-friendly slug from the title
3. Send notification email to followers
4. Update recipe status to "published"

## On failure
If any step fails, revert the status to "draft".
```

### Integrations

Connect external services in `integrations/*.md`:

```markdown
# Email Integration

## Provider
Resend (https://api.resend.com)

## Authentication
API key stored in environment variable RESEND_API_KEY

## Available Actions

### Send Email
- **to**: email address (required)
- **subject**: text (required)
- **body**: text or html (required)
```

### Natural language tests

Write tests in `.test.md` with Given/When/Then:

```markdown
# User CRUD Tests

## Create a user
- Given an authenticated user with role "admin"
- When calling users_create with:
    - username: "alice"
    - email: "alice@example.com"
- Then response contains field "id"
- And response field "username" equals "alice"
```

Run with: `nlbackend test ./my-app`

## Example project

See [`example-recipes/`](./example-recipes/) for a complete Recipe Sharing Platform with users, recipes, reviews, favorites, search actions, and an email integration.

## Development

```bash
bun install
bun test              # 62 unit tests
bun run typecheck     # TypeScript strict mode

# Run the example project
bun run src/index.ts ./example-recipes

# Run the smoke test (29 end-to-end tests)
bun run example-recipes/tests/smoke-test.ts
```

## Architecture

- **Compiler** — Rule-based for schemas, LLM-powered for actions/rules/workflows
- **Database** — File-based JSON with WAL, in-memory indexes, per-collection locks
- **Runtime** — Action executor, rule engine, workflow executor (saga pattern)
- **Server** — MCP over stdio with auto-generated CRUD tools + system tools + resources
- **Cache** — `.compiled/` directory for warm starts without LLM calls

## License

MIT
