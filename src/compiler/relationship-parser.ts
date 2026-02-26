/**
 * Relationship parser — converts natural language relationship lines
 * into structured Relationship objects.
 */

import type { Relationship, RelationshipType } from "../types/schema.ts";

/** Known relationship phrases mapped to types */
const RELATIONSHIP_PATTERNS: {
  pattern: RegExp;
  type: RelationshipType;
}[] = [
  { pattern: /belongs\s+to\s+(?:a\s+)?(\w+)/i, type: "belongs_to" },
  { pattern: /has\s+many\s+(\w+)/i, type: "has_many" },
  { pattern: /has\s+one\s+(\w+)/i, type: "has_one" },
];

/** Extract the "via" field from a relationship line */
const VIA_PATTERN = /\(via\s+(\w+)\)/i;

/** Parse a single relationship line into a Relationship */
export function parseRelationship(line: string): Relationship | null {
  for (const { pattern, type } of RELATIONSHIP_PATTERNS) {
    const match = line.match(pattern);
    if (match?.[1]) {
      const entity = match[1];
      const viaMatch = line.match(VIA_PATTERN);
      return {
        type,
        entity,
        via: viaMatch?.[1],
      };
    }
  }
  return null;
}

/** Parse multiple relationship lines */
export function parseRelationships(lines: string[]): Relationship[] {
  return lines
    .map(parseRelationship)
    .filter((r): r is Relationship => r !== null);
}
