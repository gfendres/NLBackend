/**
 * Field definition parser — interprets the recognized keywords from a raw field
 * definition string into a structured FieldDefinition.
 */

import {
  FIELD_TYPES,
  AUTO_STRATEGIES,
  type FieldDefinition,
  type FieldType,
  type AutoStrategy,
} from "../types/schema.ts";
import type { RawField } from "./schema-parser.ts";

/** Parse a raw field into a structured FieldDefinition */
export function parseField(raw: RawField): FieldDefinition {
  const definition = raw.definition.trim();
  const tokens = tokenize(definition);

  const field: FieldDefinition = {
    name: raw.name,
    type: extractType(tokens),
    required: extractRequired(tokens),
    unique: hasKeyword(tokens, "unique"),
    indexed: hasKeyword(tokens, "indexed"),
    immutable: hasKeyword(tokens, "immutable"),
  };

  // Auto-generation strategy
  const auto = extractAuto(tokens);
  if (auto) field.auto = auto;

  // Default value
  const defaultVal = extractDefault(tokens);
  if (defaultVal !== undefined) field.default = defaultVal;

  // Enum values
  const enumValues = extractEnum(tokens);
  if (enumValues) field.enumValues = enumValues;

  // Min/max constraints
  const min = extractNumericKeyword(tokens, "min");
  if (min !== undefined) field.min = min;
  const max = extractNumericKeyword(tokens, "max");
  if (max !== undefined) field.max = max;

  // Reference target
  const ref = extractReference(tokens);
  if (ref) {
    field.referenceTo = ref;
    field.type = "reference";
  }

  // Auto implies certain behaviors
  if (field.auto === "uuid") {
    field.type = "uuid";
    field.immutable = true;
    field.required = true;
  }
  if (field.auto === "timestamp") {
    field.type = "date";
  }

  // Nested fields from sub-items
  if (raw.subItems.length > 0) {
    field.items = raw.subItems.map(parseField);
  }

  // If description-like text remains and nothing else was parsed
  if (field.type === "string" && !field.required && !field.auto) {
    field.description = definition;
  }

  return field;
}

/**
 * Tokenize a field definition string into lowercase tokens,
 * preserving quoted strings and parenthesized groups.
 */
function tokenize(definition: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < definition.length) {
    // Skip whitespace and commas
    if (/[\s,]/.test(definition[i]!)) {
      i++;
      continue;
    }

    // Quoted string
    if (definition[i] === '"') {
      const end = definition.indexOf('"', i + 1);
      if (end === -1) {
        tokens.push(definition.slice(i));
        break;
      }
      tokens.push(definition.slice(i, end + 1));
      i = end + 1;
      continue;
    }

    // Parenthesized group — keep as single token
    if (definition[i] === "(") {
      const end = definition.indexOf(")", i + 1);
      if (end === -1) {
        tokens.push(definition.slice(i));
        break;
      }
      tokens.push(definition.slice(i, end + 1));
      i = end + 1;
      continue;
    }

    // Regular word
    let end = i;
    while (
      end < definition.length &&
      !/[\s,()]/.test(definition[end]!) &&
      definition[end] !== '"'
    ) {
      end++;
    }
    tokens.push(definition.slice(i, end));
    i = end;
  }

  return tokens;
}

/** Check if any token matches a keyword (case-insensitive) */
function hasKeyword(tokens: string[], keyword: string): boolean {
  return tokens.some((t) => t.toLowerCase() === keyword);
}

/** Extract the field type from tokens */
function extractType(tokens: string[]): FieldType {
  for (const token of tokens) {
    const lower = token.toLowerCase() as FieldType;
    if ((FIELD_TYPES as readonly string[]).includes(lower)) {
      return lower;
    }
  }
  // Default to string if no type keyword found
  return "string";
}

/** Determine if the field is required (default: optional) */
function extractRequired(tokens: string[]): boolean {
  if (hasKeyword(tokens, "required")) return true;
  if (hasKeyword(tokens, "optional")) return false;
  // Auto fields are required by default
  if (hasKeyword(tokens, "auto")) return true;
  return false;
}

/** Extract auto-generation strategy */
function extractAuto(tokens: string[]): AutoStrategy | undefined {
  const autoIdx = tokens.findIndex((t) => t.toLowerCase() === "auto");
  if (autoIdx === -1) return undefined;

  // Check next token for strategy
  const nextToken = tokens[autoIdx + 1]?.toLowerCase();
  if (nextToken && (AUTO_STRATEGIES as readonly string[]).includes(nextToken)) {
    return nextToken as AutoStrategy;
  }

  // Check for "auto-generated" or "auto-updated" phrasing (timestamp hints)
  const joined = tokens.join(" ").toLowerCase();
  if (joined.includes("timestamp") || joined.includes("on change")) {
    return "timestamp";
  }

  return undefined;
}

/** Extract default value */
function extractDefault(tokens: string[]): unknown | undefined {
  const idx = tokens.findIndex((t) => t.toLowerCase() === "default");
  if (idx === -1) return undefined;

  const next = tokens[idx + 1];
  if (!next) return undefined;

  return parseValue(next);
}

/** Extract enum values from a parenthesized group like ("easy", "medium", "hard") */
function extractEnum(tokens: string[]): string[] | undefined {
  // Look for enum keyword followed by a parenthesized group
  const enumIdx = tokens.findIndex((t) => t.toLowerCase() === "enum");
  if (enumIdx === -1) return undefined;

  const group = tokens[enumIdx + 1];
  if (group?.startsWith("(")) {
    return parseParenGroup(group);
  }

  return undefined;
}

/** Extract a numeric value following a keyword (e.g. "min 3") */
function extractNumericKeyword(
  tokens: string[],
  keyword: string,
): number | undefined {
  const idx = tokens.findIndex((t) => t.toLowerCase() === keyword);
  if (idx === -1) return undefined;

  const next = tokens[idx + 1];
  if (!next) return undefined;

  const num = Number(next);
  return isNaN(num) ? undefined : num;
}

/** Extract reference target (e.g. "reference to User") */
function extractReference(tokens: string[]): string | undefined {
  const refIdx = tokens.findIndex((t) => t.toLowerCase() === "reference");
  if (refIdx === -1) return undefined;

  // Expect "to" then entity name
  const toToken = tokens[refIdx + 1];
  const entityToken = tokens[refIdx + 2];

  if (toToken?.toLowerCase() === "to" && entityToken) {
    return entityToken;
  }

  return undefined;
}

/** Parse a parenthesized, comma-separated group into an array of strings */
function parseParenGroup(group: string): string[] {
  // Remove outer parens
  const inner = group.slice(1, -1);
  return inner
    .split(",")
    .map((s) => s.trim())
    .map((s) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s))
    .filter(Boolean);
}

/** Parse a token value into a JS primitive */
function parseValue(token: string): unknown {
  // Quoted string
  if (token.startsWith('"') && token.endsWith('"')) {
    return token.slice(1, -1);
  }
  // Number
  const num = Number(token);
  if (!isNaN(num)) return num;
  // Boolean
  if (token.toLowerCase() === "true") return true;
  if (token.toLowerCase() === "false") return false;
  // Null
  if (token.toLowerCase() === "null") return null;
  // Plain string
  return token;
}
