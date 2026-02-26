# Tests — How to define test scenarios

Tests verify that the backend behaves as expected. There are two formats:

## 1. Natural language tests (`.test.md`) — preferred

Write tests as plain-English scenarios using Given/When/Then:

```markdown
# User CRUD Tests

## Create a user successfully
- Given an authenticated user with role "admin"
- When calling users_create with:
    - username: "alice"
    - email: "alice@example.com"
    - display_name: "Alice Smith"
- Then response contains field "id"
- And response field "username" equals "alice"
- And response field "role" equals "editor"

## Reject duplicate username
- Given an authenticated user
- When calling users_create with:
    - username: "alice"
    - email: "different@example.com"
- Then error code is "unique_constraint"

## List users with filter
- Given an authenticated user
- When calling users_list with:
    - filters: {"role": "admin"}
- Then response contains field "data"
```

### Given clause types
- `Given an authenticated user` — sets up auth context
- `Given an authenticated user with role "admin"` — auth with specific role
- `Given no authentication` — tests unauthenticated access
- `Given a user "alice" exists` — sets up test data

### When clause
- `When calling {tool_name} with:` — followed by indented key-value pairs
- `When calling {tool_name} with valid data` — uses sensible defaults

### Then/And clause types
- `Then response contains field "{field}"` — field exists
- `Then response field "{field}" equals "{value}"` — exact match
- `Then error code is "{code}"` — expected error
- `And error message mentions "{text}"` — error message contains text

### Running natural language tests

```bash
bun run /path/to/nlbackend/src/cli.ts test /path/to/this/project
```

## 2. TypeScript tests (`.ts`)

For complex scenarios, write TypeScript test scripts:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "bun",
  args: ["run", "src/index.ts", "./my-project"],
});

const client = new Client({ name: "test", version: "1.0.0" });
await client.connect(transport);

const result = await client.callTool({
  name: "users_create",
  arguments: { username: "alice", email: "alice@example.com" },
});

const content = result.content as Array<{ type: string; text: string }>;
const data = JSON.parse(content[0].text);

if (!data.id) throw new Error("Expected user to have an id");
console.log("✓ All tests passed");
await client.close();
```

## What to test

1. **CRUD operations** — Create, read, update, delete for each entity
2. **Validation** — Submitting invalid data and checking errors
3. **Uniqueness** — Duplicate values on unique fields
4. **Relationships** — Records with foreign keys
5. **Permissions** — Role-based access (once rules are compiled)
6. **Workflows** — Multi-step processes

## Tips

- Prefer `.test.md` files — they're easier to write and read
- Create entities in dependency order (users before recipes)
- Clean up test data between runs (delete `db/` contents or use fresh data)
- Use `describe_api` to verify tools are registered
