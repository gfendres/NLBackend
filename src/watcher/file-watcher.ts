/**
 * File watcher — watches project folder for markdown changes and triggers
 * incremental recompilation. Debounces rapid changes.
 */

import { watch, type FSWatcher } from "node:fs";
import { join, basename } from "node:path";
import { readFile } from "node:fs/promises";
import type { Project } from "../types/project.ts";
import type { DatabaseEngine } from "../database/engine.ts";
import type { LLMClient } from "../llm/client.ts";
import { compileSchema } from "../compiler/schema-compiler.ts";
import { parseAction } from "../compiler/action-parser.ts";
import { parseIntegration } from "../integrations/parser.ts";

const DEBOUNCE_MS = 300;

export class FileWatcher {
  private watchers: FSWatcher[] = [];
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private project: Project;
  private db: DatabaseEngine;

  constructor(project: Project, db: DatabaseEngine, _llm: LLMClient) {
    this.project = project;
    this.db = db;
  }

  /** Start watching the project folder for changes */
  start(): void {
    const folders = ["schema", "actions", "rules", "workflows", "integrations", "config"];

    for (const folder of folders) {
      const dirPath = join(this.project.rootPath, folder);
      try {
        const watcher = watch(dirPath, { recursive: true }, (_event, filename) => {
          if (!filename || !filename.endsWith(".md")) return;
          if (basename(filename) === "claude.md") return;

          const fullPath = join(dirPath, filename);
          const relativePath = `${folder}/${filename}`;

          this.debouncedReload(relativePath, fullPath, folder);
        });
        this.watchers.push(watcher);
      } catch {
        // Directory doesn't exist yet — skip
      }
    }

    console.error(`[watcher] Watching for file changes in ${folders.join(", ")}`);
  }

  /** Stop all file watchers */
  stop(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    console.error("[watcher] Stopped watching for file changes");
  }

  private debouncedReload(relativePath: string, fullPath: string, folder: string): void {
    const existing = this.debounceTimers.get(relativePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(relativePath);
      this.handleFileChange(relativePath, fullPath, folder).catch((err) => {
        console.error(`[watcher] Error reloading ${relativePath}:`, err);
      });
    }, DEBOUNCE_MS);

    this.debounceTimers.set(relativePath, timer);
  }

  private async handleFileChange(
    relativePath: string,
    fullPath: string,
    folder: string,
  ): Promise<void> {
    let content: string;
    try {
      content = await readFile(fullPath, "utf-8");
    } catch {
      // File was deleted
      this.handleFileDeletion(relativePath, folder);
      return;
    }

    console.error(`[watcher] Reloading: ${relativePath}`);

    switch (folder) {
      case "schema":
        this.reloadSchema(relativePath, content);
        break;

      case "actions":
        this.reloadAction(relativePath, content);
        break;

      case "rules":
        this.reloadRule(relativePath, content);
        break;

      case "workflows":
        this.reloadWorkflow(relativePath, content);
        break;

      case "integrations":
        this.reloadIntegration(relativePath, content);
        break;

      case "config":
        console.error(`[watcher] Config changed — restart required for full effect`);
        break;
    }
  }

  private reloadSchema(relativePath: string, content: string): void {
    try {
      const compiled = compileSchema(content, relativePath);
      const key = compiled.entity.toLowerCase();
      const isNew = !this.project.schemas.has(key);

      this.project.schemas.set(key, compiled);

      if (isNew) {
        this.db.init(new Map([[key, compiled]])).catch((err) => {
          console.error(`[watcher] Failed to init collection for ${key}:`, err);
        });
        console.error(`[watcher] Added new schema: ${compiled.entity}`);
      } else {
        console.error(`[watcher] Updated schema: ${compiled.entity}`);
      }
    } catch (err) {
      console.error(`[watcher] Failed to compile schema ${relativePath}:`, err);
    }
  }

  private reloadAction(relativePath: string, content: string): void {
    try {
      // Parse path: actions/{entity}/{operation}.md
      const parts = relativePath.split("/");
      if (parts.length < 3) return;
      const entity = parts[1]!;
      const operation = basename(parts[2]!, ".md");

      const action = parseAction(content, relativePath, entity, operation);
      this.project.actions.set(action.toolName, action);

      // Invalidate cached execution plan
      this.project.executionPlans.delete(action.toolName);

      console.error(`[watcher] Updated action: ${action.toolName}`);
    } catch (err) {
      console.error(`[watcher] Failed to parse action ${relativePath}:`, err);
    }
  }

  private reloadRule(relativePath: string, content: string): void {
    const key = basename(relativePath, ".md");
    this.project.rules.set(key, content);
    // Invalidate compiled version — requires recompilation
    this.project.compiledRules.delete(key);
    console.error(`[watcher] Updated rule: ${key} (recompilation needed)`);
  }

  private reloadWorkflow(relativePath: string, content: string): void {
    const key = basename(relativePath, ".md");
    this.project.workflows.set(key, content);
    // Invalidate compiled version — requires recompilation
    this.project.compiledWorkflows.delete(key);
    console.error(`[watcher] Updated workflow: ${key} (recompilation needed)`);
  }

  private reloadIntegration(relativePath: string, content: string): void {
    const key = basename(relativePath, ".md");
    this.project.integrations.set(key, content);
    try {
      const compiled = parseIntegration(content, key);
      this.project.compiledIntegrations.set(key, compiled);
      console.error(`[watcher] Updated integration: ${key}`);
    } catch (err) {
      console.error(`[watcher] Failed to parse integration ${relativePath}:`, err);
    }
  }

  private handleFileDeletion(relativePath: string, folder: string): void {
    const key = basename(relativePath, ".md");
    console.error(`[watcher] File deleted: ${relativePath}`);

    switch (folder) {
      case "schema":
        this.project.schemas.delete(key);
        break;
      case "rules":
        this.project.rules.delete(key);
        this.project.compiledRules.delete(key);
        break;
      case "workflows":
        this.project.workflows.delete(key);
        this.project.compiledWorkflows.delete(key);
        break;
      case "integrations":
        this.project.integrations.delete(key);
        this.project.compiledIntegrations.delete(key);
        break;
    }
  }
}
