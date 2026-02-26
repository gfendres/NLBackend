/**
 * NLBackend — Natural Language Backend Framework
 *
 * Entry point: loads a project folder, compiles schemas,
 * initializes the database, and starts the MCP server.
 *
 * Usage: nlbackend <project-path>
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadProject } from "./project/loader.ts";
import { DatabaseEngine } from "./database/engine.ts";
import { registerSystemTools } from "./server/system-tools.ts";
import { registerCrudTools } from "./server/tool-registrar.ts";
import { resolve } from "node:path";

const VERSION = "0.1.0";

async function main(): Promise<void> {
  const projectPath = resolveProjectPath();

  console.error(`[nlbackend] Loading project from: ${projectPath}`);

  // 1. Load and compile the project
  const project = await loadProject(projectPath);
  console.error(
    `[nlbackend] Loaded project "${project.name}" with ${project.schemas.size} schema(s)`,
  );

  // 2. Initialize the database
  const db = new DatabaseEngine(projectPath);
  await db.init(project.schemas);
  console.error(
    `[nlbackend] Database initialized with collections: ${db.getCollectionNames().join(", ")}`,
  );

  // 3. Create and configure the MCP server
  const server = new McpServer(
    { name: `nlbackend:${project.name}`, version: VERSION },
    { capabilities: { logging: {} } },
  );

  // 4. Register system tools
  registerSystemTools(server, project, db);

  // 5. Register auto-generated CRUD tools from schemas
  registerCrudTools(server, project.schemas, db);
  console.error(
    `[nlbackend] Registered ${project.schemas.size * 5} CRUD tools + 4 system tools`,
  );

  // 6. Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[nlbackend] MCP server running on stdio`);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.error("[nlbackend] Shutting down...");
    await db.shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.error("[nlbackend] Shutting down...");
    await db.shutdown();
    process.exit(0);
  });
}

function resolveProjectPath(): string {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: nlbackend <project-path>");
    console.error("  The project path should be a folder containing an NLBackend project.");
    process.exit(1);
  }
  return resolve(arg);
}

main().catch((err) => {
  console.error("[nlbackend] Fatal error:", err);
  process.exit(1);
});
