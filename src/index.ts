/**
 * NLBackend — Natural Language Backend Framework
 *
 * Entry point: loads a project folder, compiles schemas,
 * initializes the database, optionally compiles actions/rules/workflows,
 * and starts the MCP server.
 *
 * Usage: nlbackend <project-path> [--compile]
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadProject } from "./project/loader.ts";
import { loadServerConfig } from "./config/loader.ts";
import { DatabaseEngine } from "./database/engine.ts";
import { LLMClient } from "./llm/client.ts";
import { registerSystemTools } from "./server/system-tools.ts";
import { registerCrudTools } from "./server/tool-registrar.ts";
import { registerActionTools } from "./server/action-tool-registrar.ts";
import { compileAllActions } from "./compiler/action-compiler.ts";
import { compileAllRules } from "./compiler/rule-compiler.ts";
import { compileAllWorkflows } from "./compiler/workflow-compiler.ts";
import { resolve } from "node:path";

const VERSION = "0.2.0";

async function main(): Promise<void> {
  const { projectPath, shouldCompile } = parseArgs();

  console.error(`[nlbackend] Loading project from: ${projectPath}`);

  // 1. Load server config
  const config = await loadServerConfig(projectPath);

  // 2. Load and compile the project (schemas rule-based, actions parsed)
  const project = await loadProject(projectPath);
  console.error(
    `[nlbackend] Loaded project "${project.name}" — ` +
    `${project.schemas.size} schema(s), ${project.actions.size} action(s), ` +
    `${project.rules.size} rule(s), ${project.workflows.size} workflow(s)`,
  );

  // 3. Initialize the database
  const db = new DatabaseEngine(projectPath);
  await db.init(project.schemas);
  console.error(
    `[nlbackend] Database initialized with collections: ${db.getCollectionNames().join(", ")}`,
  );

  // 4. Initialize LLM client
  const llm = new LLMClient(config.llm);

  // 5. Optional: LLM-compile actions, rules, and workflows
  if (shouldCompile && llm.isConfigured()) {
    console.error("[nlbackend] Running LLM compilation...");
    await runCompilation(project, llm);
  } else if (shouldCompile) {
    console.error(
      "[nlbackend] Skipping compilation: LLM API key not configured. " +
      `Set ${config.llm.apiKeyEnvVar} to enable.`,
    );
  }

  // 6. Create and configure the MCP server
  const server = new McpServer(
    { name: `nlbackend:${project.name}`, version: VERSION },
    { capabilities: { logging: {} } },
  );

  // 7. Register system tools (describe_api, query_db, mutate_db, inspect, compile, explain, run_workflow)
  registerSystemTools(server, project, db, llm, config);

  // 8. Register auto-generated CRUD tools from schemas
  registerCrudTools(server, project.schemas, db);

  // 9. Register compiled action tools (if any)
  const actionToolCount = registerActionTools(server, project, db, llm);

  const crudCount = project.schemas.size * 5;
  const systemCount = 7; // describe_api, query_db, mutate_db, inspect, compile, explain, run_workflow
  console.error(
    `[nlbackend] Registered ${crudCount} CRUD + ${actionToolCount} action + ${systemCount} system tools`,
  );

  // 10. Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[nlbackend] MCP server running on stdio`);

  // Graceful shutdown
  const shutdown = async () => {
    console.error("[nlbackend] Shutting down...");
    await db.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/** LLM-compile actions, rules, and workflows */
async function runCompilation(
  project: Awaited<ReturnType<typeof loadProject>>,
  llm: LLMClient,
): Promise<void> {
  if (project.actions.size > 0) {
    const plans = await compileAllActions(
      project.actions,
      project.schemas,
      project.rules,
      llm,
      (name, i, total) =>
        console.error(`  [compile] Action ${i}/${total}: ${name}`),
    );
    for (const [name, plan] of plans) {
      project.executionPlans.set(name, plan);
    }
    console.error(`[nlbackend] Compiled ${plans.size} action(s)`);
  }

  if (project.rules.size > 0) {
    const ruleSets = await compileAllRules(
      project.rules,
      project.schemas,
      llm,
      (name, i, total) =>
        console.error(`  [compile] Rule ${i}/${total}: ${name}`),
    );
    for (const [name, ruleSet] of ruleSets) {
      project.compiledRules.set(name, ruleSet);
    }
    console.error(`[nlbackend] Compiled ${ruleSets.size} rule set(s)`);
  }

  if (project.workflows.size > 0) {
    const workflows = await compileAllWorkflows(
      project.workflows,
      project.schemas,
      llm,
      (name, i, total) =>
        console.error(`  [compile] Workflow ${i}/${total}: ${name}`),
    );
    for (const [name, workflow] of workflows) {
      project.compiledWorkflows.set(name, workflow);
    }
    console.error(`[nlbackend] Compiled ${workflows.size} workflow(s)`);
  }
}

function parseArgs(): { projectPath: string; shouldCompile: boolean } {
  const args = process.argv.slice(2);
  let projectPath = "";
  let shouldCompile = false;

  for (const arg of args) {
    if (arg === "--compile") {
      shouldCompile = true;
    } else if (!arg.startsWith("-")) {
      projectPath = arg;
    }
  }

  if (!projectPath) {
    console.error("Usage: nlbackend <project-path> [--compile]");
    console.error("  --compile  Run LLM compilation on startup");
    process.exit(1);
  }

  return { projectPath: resolve(projectPath), shouldCompile };
}

main().catch((err) => {
  console.error("[nlbackend] Fatal error:", err);
  process.exit(1);
});
