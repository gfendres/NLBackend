/**
 * Smoke test — exercises the full CRUD flow against the example-recipes project
 * via the MCP JSON-RPC protocol over stdin/stdout.
 *
 * Usage: bun run example-recipes/tests/smoke-test.ts
 */

import { spawn } from "node:child_process";
import { join } from "node:path";

const PROJECT_DIR = join(import.meta.dir, "..");
const SERVER = join(import.meta.dir, "../../src/index.ts");

let nextId = 1;

function jsonrpc(method: string, params: unknown = {}) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: nextId++,
    method,
    params,
  });
}

function call(toolName: string, args: Record<string, unknown> = {}) {
  return jsonrpc("tools/call", { name: toolName, arguments: args });
}

async function main() {
  const proc = spawn("bun", ["run", SERVER, PROJECT_DIR], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const responses = new Map<number, unknown>();
  let buffer = "";

  proc.stdout!.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    // Parse newline-delimited JSON
    const lines = buffer.split("\n");
    buffer = lines.pop()!; // keep incomplete tail
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined) responses.set(msg.id, msg);
      } catch { /* ignore */ }
    }
  });

  proc.stderr!.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
  });

  function send(msg: string): void {
    proc.stdin!.write(msg + "\n");
  }

  async function waitFor(id: number, timeoutMs = 5000): Promise<any> {
    const start = Date.now();
    while (!responses.has(id)) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timeout waiting for response id=${id}`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return responses.get(id);
  }

  function getContent(res: any): any {
    const text = res?.result?.content?.[0]?.text;
    if (!text) return res?.result;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  let passed = 0;
  let failed = 0;
  function assert(label: string, ok: boolean, detail?: string) {
    if (ok) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
      failed++;
    }
  }

  // --- Initialize ---
  const initId = nextId;
  send(jsonrpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "1.0.0" },
  }));
  const initRes = await waitFor(initId);
  assert("Server initialized", initRes.result?.serverInfo?.name?.includes("Recipe"));

  // --- Create users ---
  console.log("\n📦 Users");

  const createUser1Id = nextId;
  send(call("users_create", {
    username: "chefjane",
    email: "jane@example.com",
    display_name: "Chef Jane",
    bio: "I love Italian food",
  }));
  const user1Res = await waitFor(createUser1Id);
  const user1 = getContent(user1Res);
  assert("Create user (default role)", user1?.role === "editor");
  assert("Create user (uuid assigned)", typeof user1?.id === "string" && user1.id.length > 0);
  assert("Create user (timestamps set)", typeof user1?.created_at === "string");

  const createUser2Id = nextId;
  send(call("users_create", {
    username: "chefbob",
    email: "bob@example.com",
    display_name: "Chef Bob",
    role: "admin",
  }));
  const user2Res = await waitFor(createUser2Id);
  const user2 = getContent(user2Res);
  assert("Create admin user", user2?.role === "admin");

  // --- Uniqueness ---
  const dupId = nextId;
  send(call("users_create", {
    username: "chefjane",  // duplicate!
    email: "jane2@example.com",
  }));
  const dupRes = await waitFor(dupId);
  const dupContent = dupRes?.result?.content?.[0]?.text ?? "";
  assert("Uniqueness rejected duplicate username", dupContent.includes("Unique constraint") || dupRes?.result?.isError);

  // --- Create recipes ---
  console.log("\n🍝 Recipes");

  const createRecipe1Id = nextId;
  send(call("recipes_create", {
    title: "Pasta Carbonara",
    description: "Classic Roman pasta dish with guanciale and pecorino",
    ingredients: [
      { name: "spaghetti", quantity: "400g" },
      { name: "guanciale", quantity: "200g" },
      { name: "eggs", quantity: "4" },
      { name: "pecorino romano", quantity: "100g" },
    ],
    steps: [
      "Boil pasta in heavily salted water",
      "Fry guanciale until crispy",
      "Mix eggs with grated pecorino and black pepper",
      "Toss hot pasta with guanciale, then quickly fold in egg mixture",
    ],
    difficulty: "medium",
    cook_time_minutes: 25,
    servings: 4,
    author_id: user1.id,
    tags: ["italian", "pasta", "quick"],
  }));
  const recipe1Res = await waitFor(createRecipe1Id);
  const recipe1 = getContent(recipe1Res);
  assert("Create recipe", recipe1?.title === "Pasta Carbonara");
  assert("Recipe default published=false", recipe1?.published === false);
  assert("Recipe default rating=0", recipe1?.rating_average === 0);
  assert("Recipe ingredients stored", Array.isArray(recipe1?.ingredients) && recipe1.ingredients.length === 4);

  const createRecipe2Id = nextId;
  send(call("recipes_create", {
    title: "Greek Salad",
    description: "Fresh Mediterranean salad",
    ingredients: [
      { name: "tomatoes", quantity: "4 large" },
      { name: "cucumber", quantity: "1" },
      { name: "feta", quantity: "200g" },
      { name: "olives", quantity: "100g" },
    ],
    steps: [
      "Chop tomatoes and cucumber into chunks",
      "Add olives and crumbled feta",
      "Drizzle with olive oil and oregano",
    ],
    difficulty: "easy",
    cook_time_minutes: 10,
    servings: 2,
    author_id: user2.id,
    tags: ["greek", "salad", "vegetarian"],
  }));
  await waitFor(createRecipe2Id);

  // --- List & filter ---
  console.log("\n🔍 Queries");

  const listAllId = nextId;
  send(call("recipes_list", {}));
  const listAll = getContent(await waitFor(listAllId));
  assert("List all recipes", listAll?.data?.length === 2);
  assert("Pagination metadata present", listAll?.pagination?.total === 2);

  const filterById = nextId;
  send(call("recipes_list", { filters: { author_id: user1.id } }));
  const filtered = getContent(await waitFor(filterById));
  assert("Filter recipes by author", filtered?.data?.length === 1 && filtered.data[0].title === "Pasta Carbonara");

  // --- Get single record ---
  const getRecipeId = nextId;
  send(call("recipes_get", { id: recipe1.id }));
  const gotRecipe = getContent(await waitFor(getRecipeId));
  assert("Get recipe by ID", gotRecipe?.title === "Pasta Carbonara");

  // --- Update ---
  console.log("\n✏️  Updates");

  const updateId = nextId;
  send(call("recipes_update", {
    id: recipe1.id,
    data: { published: true, description: "Updated description" },
  }));
  const updated = getContent(await waitFor(updateId));
  assert("Update recipe published", updated?.published === true);
  assert("Update recipe description", updated?.description === "Updated description");
  assert("Immutable id unchanged", updated?.id === recipe1.id);
  assert("Version incremented", updated?._version === 2);

  // --- Reviews ---
  console.log("\n⭐ Reviews");

  const review1Id = nextId;
  send(call("reviews_create", {
    recipe_id: recipe1.id,
    author_id: user2.id,
    rating: 5,
    comment: "Best carbonara recipe ever!",
  }));
  const review1 = getContent(await waitFor(review1Id));
  assert("Create review", review1?.rating === 5);
  assert("Review references recipe", review1?.recipe_id === recipe1.id);

  // --- Favorites ---
  console.log("\n❤️  Favorites");

  const fav1Id = nextId;
  send(call("favorites_create", {
    user_id: user2.id,
    recipe_id: recipe1.id,
  }));
  const fav1 = getContent(await waitFor(fav1Id));
  assert("Create favorite", fav1?.user_id === user2.id);

  const listFavsId = nextId;
  send(call("favorites_list", { filters: { user_id: user2.id } }));
  const favs = getContent(await waitFor(listFavsId));
  assert("List user's favorites", favs?.data?.length === 1);

  // --- System tools ---
  console.log("\n🛠️  System Tools");

  const describeId = nextId;
  send(call("describe_api", {}));
  const api = getContent(await waitFor(describeId));
  assert("describe_api returns schemas", api?.schemas?.length === 4);
  // 4 schemas × 5 CRUD = 20, + 3 action tools + 7 system tools = 30
  assert("describe_api returns tools", api?.tools?.length === 30);

  const inspectId = nextId;
  send(call("inspect", { type: "schema", name: "recipe" }));
  const inspected = getContent(await waitFor(inspectId));
  assert("inspect recipe schema", inspected?.entity === "Recipe");
  assert("inspect shows fields", inspected?.fields?.length > 5);

  // --- query_db / mutate_db (raw tools) ---
  console.log("\n🗄️  Raw DB tools");

  const rawQueryId = nextId;
  send(call("query_db", { collection: "users", filters: { username: "chefjane" } }));
  const rawQuery = getContent(await waitFor(rawQueryId));
  assert("query_db with filter", rawQuery?.data?.length === 1);

  const rawMutateId = nextId;
  send(call("mutate_db", {
    collection: "users",
    operation: "update",
    id: user1.id,
    data: { bio: "Updated bio via mutate_db" },
  }));
  const rawMutated = getContent(await waitFor(rawMutateId));
  assert("mutate_db update", rawMutated?.bio === "Updated bio via mutate_db");

  // --- Delete ---
  console.log("\n🗑️  Deletions");

  const deleteFavId = nextId;
  send(call("favorites_delete", { id: fav1.id }));
  const deleteRes = getContent(await waitFor(deleteFavId));
  assert("Delete favorite", deleteRes?.deleted === true || deleteRes?.success === true || (typeof deleteRes === "string" && deleteRes.includes("eleted")));

  // --- Summary ---
  console.log(`\n${"=".repeat(50)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  console.log(`${"=".repeat(50)}\n`);

  proc.kill();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
