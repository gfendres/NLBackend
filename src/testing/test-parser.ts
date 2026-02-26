/**
 * Test parser — parses .test.md files using Given/When/Then format
 * into executable test scenarios.
 */

/** A parsed test file */
export interface TestFile {
  /** Title from H1 heading */
  title: string;
  /** Individual test scenarios */
  scenarios: TestScenario[];
}

/** A single test scenario */
export interface TestScenario {
  /** Scenario name from H2 heading */
  name: string;
  /** Given conditions */
  given: GivenClause[];
  /** When action */
  when: WhenClause | null;
  /** Then assertions */
  then: ThenClause[];
}

export interface GivenClause {
  /** The raw text of the given clause */
  text: string;
  /** Parsed type */
  type: "auth" | "seed" | "state";
  /** Auth role (for auth type) */
  role?: string;
  /** Is authenticated */
  authenticated?: boolean;
}

export interface WhenClause {
  /** Tool name to call */
  toolName: string;
  /** Arguments to pass */
  arguments: Record<string, unknown>;
  /** "valid data" placeholder */
  useValidData?: boolean;
}

export interface ThenClause {
  /** The raw text of the then clause */
  text: string;
  /** Parsed type */
  type: "contains_field" | "field_equals" | "error_code" | "error_message" | "success";
  /** Field name (for field assertions) */
  field?: string;
  /** Expected value (for equality checks) */
  value?: unknown;
  /** Error code (for error assertions) */
  errorCode?: string;
  /** Substring to check in error message */
  errorContains?: string;
}

/** Parse a .test.md file into structured test scenarios */
export function parseTestFile(content: string): TestFile {
  const lines = content.split("\n");
  let title = "Untitled Tests";
  const scenarios: TestScenario[] = [];

  let currentScenario: TestScenario | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // H1 — file title
    const h1Match = trimmed.match(/^#\s+(.+)$/);
    if (h1Match?.[1]) {
      title = h1Match[1].trim();
      continue;
    }

    // H2 — new scenario
    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match?.[1]) {
      if (currentScenario) scenarios.push(currentScenario);
      currentScenario = {
        name: h2Match[1].trim(),
        given: [],
        when: null,
        then: [],
      };
      continue;
    }

    if (!currentScenario) continue;

    // Given clause
    const givenMatch = trimmed.match(/^-\s+Given\s+(.+)/i);
    if (givenMatch?.[1]) {
      currentScenario.given.push(parseGiven(givenMatch[1]));
      continue;
    }

    // When clause
    const whenMatch = trimmed.match(/^-\s+When\s+calling\s+(\w+)\s+with[:\s]*(.*)/i);
    if (whenMatch?.[1]) {
      currentScenario.when = {
        toolName: whenMatch[1],
        arguments: {},
        useValidData: whenMatch[2]?.toLowerCase().includes("valid data"),
      };
      continue;
    }

    // When clause arguments (indented list items under When)
    if (currentScenario.when) {
      const argMatch = trimmed.match(/^-\s+(\w+)\s*:\s*(.+)/);
      if (argMatch?.[1] && argMatch[2] !== undefined) {
        currentScenario.when.arguments[argMatch[1]] = parseValue(argMatch[2].trim());
        continue;
      }
    }

    // Then / And clauses
    const thenMatch = trimmed.match(/^-\s+(?:Then|And)\s+(.+)/i);
    if (thenMatch?.[1]) {
      currentScenario.then.push(parseThen(thenMatch[1]));
      continue;
    }
  }

  if (currentScenario) scenarios.push(currentScenario);

  return { title, scenarios };
}

// --- Clause parsers ---

function parseGiven(text: string): GivenClause {
  const lower = text.toLowerCase();

  // "no authentication"
  if (lower.includes("no auth")) {
    return { text, type: "auth", authenticated: false };
  }

  // "an authenticated user with role "editor""
  const roleMatch = text.match(/role\s+"?(\w+)"?/i);
  if (lower.includes("authenticated") || roleMatch) {
    return {
      text,
      type: "auth",
      authenticated: true,
      role: roleMatch?.[1] ?? "editor",
    };
  }

  return { text, type: "state" };
}

function parseThen(text: string): ThenClause {
  // "response contains field "id""
  const containsMatch = text.match(/contains\s+field\s+"(\w+)"/i);
  if (containsMatch?.[1]) {
    return { text, type: "contains_field", field: containsMatch[1] };
  }

  // "response field "title" equals "Pasta""
  const equalsMatch = text.match(
    /field\s+"(\w+)"\s+equals?\s+(.+)/i,
  );
  if (equalsMatch?.[1] && equalsMatch[2] !== undefined) {
    return {
      text,
      type: "field_equals",
      field: equalsMatch[1],
      value: parseValue(equalsMatch[2].trim()),
    };
  }

  // "error code is "invalid_input""
  const errorCodeMatch = text.match(/error\s+code\s+is\s+"(\w+)"/i);
  if (errorCodeMatch?.[1]) {
    return { text, type: "error_code", errorCode: errorCodeMatch[1] };
  }

  // "error message mentions "title""
  const errorMsgMatch = text.match(/error\s+message\s+(?:mentions|contains)\s+"([^"]+)"/i);
  if (errorMsgMatch?.[1]) {
    return { text, type: "error_message", errorContains: errorMsgMatch[1] };
  }

  return { text, type: "success" };
}

/** Parse a value from test markdown — handles strings, numbers, booleans, JSON */
function parseValue(raw: string): unknown {
  // Quoted string
  const quotedMatch = raw.match(/^"([^"]*)"$/);
  if (quotedMatch) return quotedMatch[1];

  // Boolean
  if (raw === "true") return true;
  if (raw === "false") return false;

  // Number
  const num = Number(raw);
  if (!isNaN(num) && raw.trim() !== "") return num;

  // JSON array or object
  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch {
      // Try converting JS-like notation to valid JSON:
      // {name: "val"} → {"name": "val"}
      try {
        const jsonified = raw.replace(
          /(\{|,)\s*(\w+)\s*:/g,
          '$1 "$2":',
        );
        return JSON.parse(jsonified);
      } catch {
        return raw;
      }
    }
  }

  // Special reference
  if (raw.includes("authenticated user's")) return "__AUTH_USER_REF__";

  return raw;
}
