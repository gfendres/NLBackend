# Tests — How to define test scenarios

Tests verify that the backend behaves as expected. Write them as plain-English scenarios that describe the setup, action, and expected outcome.

## File naming

Name test files after what they test: `smoke-test.ts`, `recipe-crud.ts`, `permissions.ts`.

Currently, test files are TypeScript scripts that run against the MCP server. In the future, natural language test definitions will be supported.

## Test script structure

Tests use Bun and the `@modelcontextprotocol/sdk` client to call MCP tools:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "bun",
  args: ["run", "src/index.ts", "./my-project"],
});

const client = new Client({ name: "test", version: "1.0.0" });
await client.connect(transport);

// Call tools
const result = await client.callTool({
  name: "users_create",
  arguments: { username: "alice", email: "alice@example.com" },
});

// Parse the response
const content = result.content as Array<{ type: string; text: string }>;
const data = JSON.parse(content[0].text);

// Assert
if (!data.id) throw new Error("Expected user to have an id");

console.log("✓ All tests passed");
await client.close();
```

## What to test

1. **Smoke test** — Can you start the server and list tools?
2. **CRUD operations** — Create, read, update, delete for each entity
3. **Relationships** — Creating records with foreign keys
4. **Validation** — Submitting invalid data and checking errors
5. **Permissions** — Ensure role-based access is enforced (once rules are compiled)
6. **Workflows** — Trigger workflows and verify all steps execute

## Tips

- Start with a smoke test that connects and lists tools
- Create entities in dependency order (users before recipes)
- Clean up test data after each run (or use a fresh db/ folder)
- Use `describe_api` tool to verify the expected tools are registered
