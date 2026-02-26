/**
 * Project loader — scans an NLBackend project folder, reads all definition
 * files, and compiles schemas. Returns a Project object ready for the MCP server.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import type { Project } from "../types/project.ts";
import type { CompiledSchema } from "../types/schema.ts";
import type { CompiledAction } from "../types/action.ts";
import type { ExecutionPlan } from "../types/execution-plan.ts";
import type { CompiledRuleSet } from "../types/rule.ts";
import type { CompiledWorkflow } from "../types/workflow.ts";
import { compileSchema } from "../compiler/schema-compiler.ts";
import { parseAction } from "../compiler/action-parser.ts";

/** Load an NLBackend project from a folder path */
export async function loadProject(rootPath: string): Promise<Project> {
  const { name, description } = await loadProjectMeta(rootPath);

  const schemas = await loadSchemas(rootPath);
  const actions = await loadActions(rootPath);
  const rules = await loadMarkdownFolder(rootPath, "rules");
  const workflows = await loadMarkdownFolder(rootPath, "workflows");
  const integrations = await loadMarkdownFolder(rootPath, "integrations");

  return {
    rootPath,
    name,
    description,
    schemas,
    actions,
    executionPlans: new Map<string, ExecutionPlan>(),
    compiledRules: new Map<string, CompiledRuleSet>(),
    compiledWorkflows: new Map<string, CompiledWorkflow>(),
    rules,
    workflows,
    integrations,
  };
}

/** Read project.md for name and description */
async function loadProjectMeta(
  rootPath: string,
): Promise<{ name: string; description: string }> {
  try {
    const content = await readFile(join(rootPath, "project.md"), "utf-8");
    const lines = content.split("\n");

    let name = "Untitled Project";
    const descLines: string[] = [];
    let pastHeading = false;

    for (const line of lines) {
      const h1Match = line.match(/^#\s+(.+)$/);
      if (h1Match?.[1]) {
        name = h1Match[1].trim();
        pastHeading = true;
        continue;
      }
      if (pastHeading && line.match(/^##/)) break; // Stop at next heading
      if (pastHeading && line.trim()) descLines.push(line.trim());
    }

    return { name, description: descLines.join(" ") };
  } catch {
    return { name: "Untitled Project", description: "" };
  }
}

/** Load and compile all schema files from schema/ folder */
async function loadSchemas(
  rootPath: string,
): Promise<Map<string, CompiledSchema>> {
  const schemaDir = join(rootPath, "schema");
  const schemas = new Map<string, CompiledSchema>();

  const files = await listMarkdownFiles(schemaDir);
  for (const file of files) {
    const content = await readFile(join(schemaDir, file), "utf-8");
    const relativePath = `schema/${file}`;

    try {
      const compiled = compileSchema(content, relativePath);
      schemas.set(compiled.entity.toLowerCase(), compiled);
    } catch (err) {
      console.error(`Failed to compile schema ${file}:`, err);
    }
  }

  return schemas;
}

/**
 * Load all action files from actions/ subdirectories.
 * Convention: actions/{entity}/{operation}.md → {entity}_{operation}
 */
async function loadActions(
  rootPath: string,
): Promise<Map<string, CompiledAction>> {
  const actionsDir = join(rootPath, "actions");
  const actions = new Map<string, CompiledAction>();

  let entityDirs: string[];
  try {
    entityDirs = await readdir(actionsDir);
  } catch {
    return actions; // No actions directory
  }

  for (const entityDir of entityDirs) {
    const entityPath = join(actionsDir, entityDir);

    // Skip non-directories and claude.md
    if (entityDir.endsWith(".md") || entityDir.startsWith("_")) continue;
    if (!(await isDirectory(entityPath))) continue;

    const files = await listMarkdownFiles(entityPath);
    for (const file of files) {
      const content = await readFile(join(entityPath, file), "utf-8");
      const operation = basename(file, ".md");
      const relativePath = `actions/${entityDir}/${file}`;

      try {
        const action = parseAction(content, relativePath, entityDir, operation);
        actions.set(action.toolName, action);
      } catch (err) {
        console.error(`Failed to parse action ${relativePath}:`, err);
      }
    }
  }

  return actions;
}

/** Load all markdown files from a folder as raw text, keyed by filename */
async function loadMarkdownFolder(
  rootPath: string,
  folder: string,
): Promise<Map<string, string>> {
  const dirPath = join(rootPath, folder);
  const result = new Map<string, string>();

  const files = await listMarkdownFiles(dirPath);
  for (const file of files) {
    const content = await readFile(join(dirPath, file), "utf-8");
    const key = basename(file, ".md");
    result.set(key, content);
  }

  return result;
}

/** List .md files in a directory (non-recursive, excluding claude.md) */
async function listMarkdownFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath);
    return entries.filter(
      (f) => f.endsWith(".md") && f !== "claude.md" && !f.startsWith("_"),
    );
  } catch {
    return []; // Directory doesn't exist yet
  }
}

/** Check if a path is a directory */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
