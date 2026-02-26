/**
 * Test runner — executes parsed test scenarios against the MCP server.
 * Launches a server subprocess, runs Given/When/Then scenarios, reports results.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { parseTestFile, type TestFile, type TestScenario, type ThenClause } from "./test-parser.ts";

/** Result of a single scenario */
interface ScenarioResult {
  name: string;
  passed: boolean;
  error?: string;
  assertions: Array<{ text: string; passed: boolean; detail?: string }>;
}

/** Result of the full test run */
export interface TestRunResult {
  files: Array<{ title: string; scenarios: ScenarioResult[] }>;
  totalPassed: number;
  totalFailed: number;
}

/**
 * Run all .test.md files in a project's tests/ directory.
 */
export async function runTests(
  projectPath: string,
  serverEntryPoint: string,
): Promise<TestRunResult> {
  const testsDir = join(projectPath, "tests");
  const result: TestRunResult = {
    files: [],
    totalPassed: 0,
    totalFailed: 0,
  };

  // Find .test.md files
  let files: string[];
  try {
    const entries = await readdir(testsDir, { recursive: true });
    files = entries.filter(
      (f) => typeof f === "string" && f.endsWith(".test.md"),
    ) as string[];
  } catch {
    console.error(`No tests/ directory found in ${projectPath}`);
    return result;
  }

  if (files.length === 0) {
    console.error("No .test.md files found");
    return result;
  }

  // Parse all test files
  const testFiles: Array<{ path: string; parsed: TestFile }> = [];
  for (const file of files) {
    const content = await readFile(join(testsDir, file), "utf-8");
    testFiles.push({ path: file, parsed: parseTestFile(content) });
  }

  // Start server
  const server = new TestServer(projectPath, serverEntryPoint);
  await server.start();

  try {
    for (const { path, parsed } of testFiles) {
      console.log(`\n📄 ${parsed.title} (${path})`);
      const fileResult: { title: string; scenarios: ScenarioResult[] } = {
        title: parsed.title,
        scenarios: [],
      };

      for (const scenario of parsed.scenarios) {
        const scenarioResult = await runScenario(scenario, server);
        fileResult.scenarios.push(scenarioResult);

        if (scenarioResult.passed) {
          result.totalPassed++;
          console.log(`  ✅ ${scenario.name}`);
        } else {
          result.totalFailed++;
          console.log(`  ❌ ${scenario.name}`);
          for (const a of scenarioResult.assertions) {
            if (!a.passed) {
              console.log(`     ↳ ${a.text}${a.detail ? ` — ${a.detail}` : ""}`);
            }
          }
        }
      }

      result.files.push(fileResult);
    }
  } finally {
    server.stop();
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(
    `  Results: ${result.totalPassed} passed, ${result.totalFailed} failed out of ${result.totalPassed + result.totalFailed}`,
  );
  console.log(`${"=".repeat(50)}\n`);

  return result;
}

// --- Scenario runner ---

async function runScenario(
  scenario: TestScenario,
  server: TestServer,
): Promise<ScenarioResult> {
  const assertions: ScenarioResult["assertions"] = [];

  if (!scenario.when) {
    return {
      name: scenario.name,
      passed: false,
      error: "No When clause found",
      assertions: [],
    };
  }

  try {
    // Execute the tool call
    const response = await server.callTool(
      scenario.when.toolName,
      scenario.when.arguments,
    );

    // Parse response
    const content = response?.result?.content?.[0]?.text;
    const isError = response?.result?.isError === true;
    let data: Record<string, unknown> = {};
    let errorData: Record<string, unknown> = {};

    if (content) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.error) {
          errorData = parsed.error;
        } else {
          data = parsed;
        }
      } catch {
        data = { _raw: content };
      }
    }

    // Evaluate Then clauses
    for (const clause of scenario.then) {
      const result = evaluateClause(clause, data, errorData, isError);
      assertions.push(result);
    }
  } catch (err) {
    return {
      name: scenario.name,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
      assertions: [],
    };
  }

  const allPassed = assertions.every((a) => a.passed);
  return { name: scenario.name, passed: allPassed, assertions };
}

function evaluateClause(
  clause: ThenClause,
  data: Record<string, unknown>,
  errorData: Record<string, unknown>,
  isError: boolean,
): { text: string; passed: boolean; detail?: string } {
  switch (clause.type) {
    case "contains_field": {
      const field = clause.field!;
      const has = field in data;
      return {
        text: clause.text,
        passed: has,
        detail: has ? undefined : `Field "${field}" not found in response`,
      };
    }

    case "field_equals": {
      const field = clause.field!;
      const actual = data[field];
      const expected = clause.value;
      const passed = actual === expected;
      return {
        text: clause.text,
        passed,
        detail: passed
          ? undefined
          : `Expected ${field}=${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      };
    }

    case "error_code": {
      const code = errorData.code as string | undefined;
      const passed = code === clause.errorCode;
      return {
        text: clause.text,
        passed,
        detail: passed ? undefined : `Expected error code "${clause.errorCode}", got "${code}"`,
      };
    }

    case "error_message": {
      const message = (errorData.message as string) ?? "";
      const passed = message.toLowerCase().includes(
        (clause.errorContains ?? "").toLowerCase(),
      );
      return {
        text: clause.text,
        passed,
        detail: passed
          ? undefined
          : `Error message "${message}" doesn't contain "${clause.errorContains}"`,
      };
    }

    case "success": {
      return {
        text: clause.text,
        passed: !isError,
        detail: isError ? "Expected success but got error" : undefined,
      };
    }

    default:
      return { text: clause.text, passed: false, detail: "Unknown assertion type" };
  }
}

// --- Test server wrapper ---

class TestServer {
  private proc: ChildProcess | null = null;
  private responses = new Map<number, unknown>();
  private nextId = 1;
  private buffer = "";
  private projectPath: string;
  private serverEntry: string;

  constructor(projectPath: string, serverEntry: string) {
    this.projectPath = projectPath;
    this.serverEntry = serverEntry;
  }

  async start(): Promise<void> {
    this.proc = spawn("bun", ["run", this.serverEntry, this.projectPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout!.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop()!;
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined) this.responses.set(msg.id, msg);
        } catch { /* ignore non-JSON */ }
      }
    });

    this.proc.stderr!.on("data", (chunk: Buffer) => {
      // Suppress server logs during tests unless DEBUG
      if (process.env.DEBUG) {
        process.stderr.write(chunk);
      }
    });

    // Initialize MCP connection
    const initId = this.nextId;
    this.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: this.nextId++,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test-runner", version: "1.0.0" },
        },
      }),
    );

    await this.waitFor(initId);
  }

  stop(): void {
    this.proc?.kill();
    this.proc = null;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<any> {
    const id = this.nextId;
    this.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: this.nextId++,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    );
    return this.waitFor(id);
  }

  private send(msg: string): void {
    this.proc!.stdin!.write(msg + "\n");
  }

  private async waitFor(id: number, timeoutMs = 10_000): Promise<any> {
    const start = Date.now();
    while (!this.responses.has(id)) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timeout waiting for response id=${id}`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return this.responses.get(id);
  }
}
