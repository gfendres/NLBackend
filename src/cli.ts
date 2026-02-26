#!/usr/bin/env bun
/**
 * NLBackend CLI — entry point for the command-line interface.
 *
 * Commands:
 *   nlbackend <project-path> [--compile]   Start the MCP server
 *   nlbackend init [<folder>]              Create a new project from template
 *   nlbackend version                      Print version
 */

import { resolve, join } from "node:path";
import { cp, mkdir, access } from "node:fs/promises";
import { runTests } from "./testing/test-runner.ts";

const VERSION = "0.3.0";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  if (command === "version" || command === "--version" || command === "-v") {
    console.log(`nlbackend v${VERSION}`);
    process.exit(0);
  }

  if (command === "init") {
    await initProject(args[1]);
    process.exit(0);
  }

  if (command === "config") {
    printMcpConfig(args[1]);
    process.exit(0);
  }

  if (command === "test") {
    const projectPath = resolve(args[1] ?? ".");
    const serverEntry = join(import.meta.dir, "index.ts");
    const result = await runTests(projectPath, serverEntry);
    process.exit(result.totalFailed > 0 ? 1 : 0);
  }

  // Default: start the MCP server (delegate to index.ts)
  // Re-exec with index.ts and forward all args
  const indexPath = join(import.meta.dir, "index.ts");
  const proc = Bun.spawn(["bun", "run", indexPath, ...args], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  const exitCode = await proc.exited;
  process.exit(exitCode);
}

/** Create a new NLBackend project from the template */
async function initProject(target?: string): Promise<void> {
  const folder = target ?? "my-backend";
  const targetPath = resolve(folder);

  // Check if target already exists
  try {
    await access(targetPath);
    console.error(`Error: "${folder}" already exists. Choose a different name.`);
    process.exit(1);
  } catch {
    // Good — doesn't exist
  }

  // Find the template directory
  const templatePath = resolve(join(import.meta.dir, "..", "template"));

  try {
    await access(templatePath);
  } catch {
    console.error(
      "Error: Template directory not found. Make sure the nlbackend package is installed correctly.",
    );
    process.exit(1);
  }

  console.log(`Creating new NLBackend project in ./${folder}/`);
  console.log();

  // Copy template
  await cp(templatePath, targetPath, { recursive: true });

  // Create empty directories
  const emptyDirs = ["schema", "actions", "rules", "workflows", "integrations", "tests", "agents"];
  for (const dir of emptyDirs) {
    await mkdir(join(targetPath, dir), { recursive: true });
  }

  console.log("  ✅ Created project structure:");
  console.log(`     ${folder}/`);
  console.log("     ├── project.md");
  console.log("     ├── claude.md");
  console.log("     ├── config/server.md");
  console.log("     ├── schema/        (add your data models here)");
  console.log("     ├── actions/       (add custom operations here)");
  console.log("     ├── rules/         (add business rules here)");
  console.log("     ├── workflows/     (add multi-step processes here)");
  console.log("     ├── integrations/  (add external service configs here)");
  console.log("     └── tests/         (add test scenarios here)");
  console.log();
  console.log("  Next steps:");
  console.log(`  1. cd ${folder}`);
  console.log("  2. Edit project.md with your project name and description");
  console.log("  3. Add schema files to schema/ (one per entity)");
  console.log("  4. Start the server: nlbackend .");
  console.log("  5. Get MCP config: nlbackend config .");
  console.log();
  console.log("  Each folder has a claude.md explaining the conventions.");
  console.log("  Share the project folder with an LLM and it will know how to build your backend!");
  console.log();
  console.log("  The project is just markdown — no framework code lives here.");
  console.log("  Two ways to use:");
  console.log("    🔨 Building LLM — reads claude.md files, writes .md definitions");
  console.log("    🤖 Consuming LLM — connects via MCP, calls tools to read/write data");
}

/** Output the MCP client config JSON needed to connect to this project */
function printMcpConfig(target?: string): void {
  const projectPath = resolve(target ?? ".");

  // Derive a server name from the folder name
  const folderName = projectPath.split("/").pop() ?? "my-backend";
  const serverName = `nlbackend-${folderName}`;

  const mcpConfig = {
    mcpServers: {
      [serverName]: {
        command: "nlbackend",
        args: [projectPath],
      },
    },
  };

  console.log();
  console.log("Add this to your MCP client config to connect an LLM to this backend.");
  console.log();
  console.log("┌─ Claude Desktop (~/.claude/claude_desktop_config.json) ─────────");
  console.log(JSON.stringify(mcpConfig, null, 2));
  console.log();
  console.log("┌─ Cursor (.cursor/mcp.json) ─────────────────────────────────────");
  console.log(JSON.stringify(mcpConfig, null, 2));
  console.log();
  console.log("┌─ Generic MCP stdio config ──────────────────────────────────────");
  console.log(`  command: nlbackend ${projectPath}`);
  console.log();
  console.log("Once configured, the LLM can read 'nlbackend://project' for a full overview,");
  console.log("or call 'describe_api' to discover all available tools.");
  console.log();
}

function printUsage(): void {
  console.log(`
nlbackend v${VERSION} — Natural Language Backend Framework

Usage:
  nlbackend <project-path>            Start the MCP server
  nlbackend <project-path> --compile  Start with LLM compilation
  nlbackend init [<folder>]           Create a new project from template
  nlbackend config [<project-path>]   Output MCP client connection config
  nlbackend test [<project-path>]     Run .test.md files against the server
  nlbackend version                   Print version

Examples:
  nlbackend ./my-backend              Start serving the project
  nlbackend init recipe-app           Create a new project called "recipe-app"
  nlbackend config ./my-backend       Get MCP config to connect Claude/Cursor
  nlbackend test ./my-backend         Run natural language tests
  `.trim());
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
