# NLBackend Project

This is a backend defined entirely in natural language files. Each folder has its own `claude.md` explaining how to write files for that folder.

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
| `db/` | Auto-managed data storage | `db/claude.md` (don't edit data) |

## Quick start

1. Edit `project.md` with your project's name and description
2. Add schema files to `schema/` — one per entity
3. CRUD tools are auto-generated from your schemas (no code needed!)
4. Add rules, actions, and workflows as needed

## Running the server

```bash
# Start the MCP server (requires Bun — https://bun.sh)
bun run /path/to/nlbackend/src/index.ts .

# Get MCP connection config for Claude Desktop / Cursor
bun run /path/to/nlbackend/src/cli.ts config .
```

## Connecting a consuming LLM

After starting the server, configure your MCP client (Claude Desktop, Cursor, etc.) to connect:

```json
{
  "mcpServers": {
    "my-backend": {
      "command": "bun",
      "args": ["run", "/path/to/nlbackend/src/index.ts", "/path/to/this/project"]
    }
  }
}
```

The consuming LLM can then:
- Read `nlbackend://project` for a full overview
- Call `describe_api` to discover all tools
- Use CRUD tools like `users_create`, `recipes_list`
- Use `query_db` for complex queries
- Use `run_workflow` for multi-step processes
