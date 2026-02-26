# NLBackend Project

This is a backend defined entirely in natural language files. **You don't write code — you write markdown.**

Each folder has its own `claude.md` explaining how to write files for that folder. Read the relevant `claude.md` before creating or editing files.

## Your job

The user will describe what they want in plain English. You translate that into `.md` files in the correct folders:

1. Read `project.md` to understand the project
2. Read the `claude.md` in each folder you need to work with
3. Create or edit `.md` files following the conventions
4. Start simple — schemas first, then add complexity only when asked

## Folder guide

| Folder | Purpose | Start here |
|--------|---------|-----------|
| `schema/` | Define your data models | `schema/claude.md` |
| `actions/` | Define custom MCP tools | `actions/claude.md` |
| `rules/` | Define business rules & policies | `rules/claude.md` |
| `workflows/` | Define multi-step processes | `workflows/claude.md` |
| `integrations/` | Configure external services | `integrations/claude.md` |
| `config/` | Configure the LLM and runtime | `config/claude.md` |
| `tests/` | Test scenarios | `tests/claude.md` |
| `db/` | Auto-managed data storage | `db/claude.md` (**don't edit**) |

## What you get for free

When you create a schema file like `schema/task.md`, the framework **automatically** generates these tools — no action files needed:

- `tasks_create` — create a new task
- `tasks_get` — get a task by ID
- `tasks_list` — list tasks with filters, sorting, pagination
- `tasks_update` — update a task
- `tasks_delete` — delete a task

Plus these system tools are always available:
- `describe_api` — list everything available
- `query_db` — complex queries
- `mutate_db` — low-level data operations
- `inspect` — view compiled state
- `run_workflow` — execute workflows

## Quick start for a new project

1. Edit `project.md` with the project's name and description
2. Create schema files in `schema/` — one per entity (read `schema/claude.md` first)
3. That's it! CRUD tools are auto-generated. Add rules/actions/workflows only when needed.

## What NOT to do

- Don't write TypeScript, JavaScript, or any code
- Don't create files outside the recognized folders
- Don't edit anything in `db/` — it's auto-managed
- Don't add complexity the user didn't ask for
- Don't put secrets in markdown — use environment variable references

## How the user runs this project

This project is just markdown files. The NLBackend framework is a separate tool that reads them. The user runs:

```bash
# Install NLBackend (one time)
npm install -g nlbackend    # or: bunx nlbackend

# Start the MCP server
nlbackend .

# Get MCP config for Claude Desktop / Cursor
nlbackend config .

# Run tests
nlbackend test .
```

Then the user pastes the MCP config into their LLM client, and a **consuming LLM** can call the tools to read and write data.

## This project does NOT contain any framework code

Everything here is natural language definitions. The framework (`nlbackend`) is installed separately and knows how to read these files. You only need to create and edit `.md` files.
