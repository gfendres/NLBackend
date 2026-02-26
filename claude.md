# NLBackend Framework — Instructions for Claude

You are helping someone build a backend using **natural language files**. This is NOT a traditional coding project. Everything is defined in markdown files organized in a conventional folder structure. The NLBackend framework reads these files and runs them as an MCP server.

## Prerequisites

- **Bun** (https://bun.sh) must be installed — `curl -fsSL https://bun.sh/install | bash`
- Clone or install the NLBackend framework
- Run `bun install` in the framework directory

## Two LLM roles

There are **two distinct LLM roles** in the NLBackend ecosystem:

### 1. Building LLM (you, right now)
You read `claude.md` files and write `.md` files that define the backend. You create schemas, actions, rules, workflows. You don't write code — you write natural language definitions.

### 2. Consuming LLM (a different LLM session)
After the server is running, a consuming LLM connects via MCP and interacts with the backend through tool calls (`users_create`, `query_db`, etc.). It reads the `nlbackend://project` resource to understand what's available.

## Your role as the Building LLM

You are the developer's pair programmer. You create, edit, and maintain the markdown files that define the backend. The user describes what they want in plain English, and you translate that into the correct file structure.

## When someone shares this repo with you

1. Read `project.md` to understand what the backend does
2. Browse the `schema/`, `actions/`, `rules/`, and `workflows/` folders to understand the current state
3. Read each folder's `claude.md` for conventions specific to that folder
4. Ask the user what they want to build or change (1–3 sentences is enough)
5. Generate or modify the necessary files following the conventions
6. Start simple — MVP schemas, basic CRUD actions, essential rules
7. Let them iterate — they'll tell you what to add or change

## Project structure

Every NLBackend project follows this structure:

```
my-backend/
├── project.md              # Project identity & overview
├── claude.md               # Instructions for the Building LLM
├── schema/                 # Data model definitions (one file per entity)
│   └── claude.md
├── actions/                # MCP tool definitions (subfolders per entity)
│   └── claude.md
├── rules/                  # Business rules & policies
│   └── claude.md
├── workflows/              # Multi-step process definitions
│   └── claude.md
├── integrations/           # External service configurations
│   └── claude.md
├── db/                     # File-based data store (auto-managed)
│   └── claude.md
├── tests/                  # Natural language test definitions
│   └── claude.md
├── config/                 # Runtime configuration
│   └── claude.md
└── agents/                 # (Optional) Sub-agent role definitions
```

## Core principles

1. **Every file should be readable by a non-technical person.** No code, no syntax sugar. Plain English with a small set of recognized keywords.

2. **Schemas use recognized keywords** for reliable rule-based compilation: `required`, `optional`, `default`, `enum`, `min`, `max`, `unique`, `indexed`, `reference to`, `auto`, `immutable`. These MUST be used — the compiler matches them literally.

3. **Actions describe behavior, not implementation.** Say "Creates a new recipe and validates all fields" — NOT "INSERT INTO recipes VALUES (...)".

4. **Rules should be unambiguous.** If you can interpret a rule two ways, it's not precise enough. Rewrite it.

5. **Convention over configuration.** File placement determines behavior:
   - A file in `schema/` becomes a data model
   - A file in `actions/recipes/` becomes an MCP tool prefixed with `recipes_`
   - A file in `rules/` becomes enforced business logic
   - A file in `workflows/` becomes a multi-step process

6. **Start simple, add complexity only when needed.** Don't create rule files, workflow files, or integration files until the user actually needs them.

## When creating a new project from scratch

Generate these files in order:

1. `project.md` — name and 1–2 sentence description
2. Schema files — one per entity, starting with the core models
3. Rule files — at minimum `rules/permissions.md` if roles exist
4. Action files — only for operations that go beyond basic CRUD (the framework auto-generates CRUD tools from schemas)
5. Config file — `config/server.md` with LLM provider settings
6. Workflow files — only if the user describes multi-step processes

## What you should NOT do

- Don't write TypeScript, JavaScript, or any code
- Don't create files outside the recognized folder structure
- Don't add complexity the user didn't ask for
- Don't create empty placeholder files — only create what's needed
- Don't modify `db/` contents directly — the database is managed by the framework
- Don't assume authentication details — ask the user

## When modifying an existing project

1. Read all existing schema files to understand the data model
2. Check for existing rules that might conflict with changes
3. Cross-reference relationships — adding a new entity might require updating existing schemas
4. Update actions that reference changed schemas
5. Only modify files that need to change — don't regenerate everything

## Running the backend

The backend runs as an MCP server. Here is the full lifecycle:

### Step 1: Start the server

```bash
# Basic — schemas auto-generate CRUD tools, no LLM API key needed
bun run src/index.ts ./my-backend

# With LLM compilation of actions/rules/workflows
ANTHROPIC_API_KEY=sk-... bun run src/index.ts ./my-backend --compile
```

### Step 2: Get MCP connection config

```bash
bun run src/cli.ts config ./my-backend
```

This outputs the JSON config snippet needed for Claude Desktop, Cursor, or any MCP client.

### Step 3: Add config to the consuming LLM's MCP client

For **Claude Desktop** (`~/.claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "my-backend": {
      "command": "bun",
      "args": ["run", "/path/to/nlbackend/src/index.ts", "/path/to/my-backend"]
    }
  }
}
```

For **Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "my-backend": {
      "command": "bun",
      "args": ["run", "/path/to/nlbackend/src/index.ts", "/path/to/my-backend"]
    }
  }
}
```

### Step 4: The consuming LLM connects and uses the API

Once connected, the consuming LLM:
1. Reads the `nlbackend://project` resource to understand the backend
2. Calls `describe_api` to see all available tools
3. Uses CRUD tools (`users_create`, `recipes_list`, etc.) to manage data
4. Uses `query_db` for complex queries with filters and pagination
5. Uses `run_workflow` to trigger multi-step processes

## System tools available at runtime

| Tool | What it does |
|------|-------------|
| `describe_api` | Lists all available tools and schemas |
| `query_db` | Read data with filters, sort, pagination |
| `mutate_db` | Create, update, or delete records |
| `inspect` | View compiled state of any schema/action/rule/workflow |
| `compile` | Trigger LLM compilation of actions/rules/workflows |
| `explain` | Dry-run showing what would happen for a tool call |
| `run_workflow` | Execute a named workflow |

Auto-generated CRUD tools per schema: `{entity}_create`, `{entity}_get`, `{entity}_list`, `{entity}_update`, `{entity}_delete`.

## MCP Resources

The server also exposes read-only resources:
- `nlbackend://project` — Full project overview with data model, tools, and getting-started guide
- `nlbackend://schema/{entity}` — Detailed schema for a specific entity
