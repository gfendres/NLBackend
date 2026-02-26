/**
 * Schema markdown parser — extracts structured sections from a schema .md file.
 * This module handles raw text parsing; field interpretation is in schema-compiler.ts.
 */

export interface RawSchema {
  entityName: string;
  description: string;
  rawFields: RawField[];
  rawRelationships: string[];
}

export interface RawField {
  name: string;
  /** Everything after the field name (type, constraints, etc.) */
  definition: string;
  /** Indented sub-items (for array of objects, nested fields) */
  subItems: RawField[];
}

/** Parse a schema markdown file into raw sections */
export function parseSchemaMarkdown(content: string): RawSchema {
  const lines = content.split("\n");
  const entityName = extractEntityName(lines);
  const sections = splitSections(lines);

  return {
    entityName,
    description: sections.description,
    rawFields: parseFieldLines(sections.fieldsLines),
    rawRelationships: sections.relationshipLines,
  };
}

/** Extract entity name from the first H1 heading */
function extractEntityName(lines: string[]): string {
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);
    if (match?.[1]) return match[1].trim();
  }
  throw new Error("Schema file must have an H1 heading with the entity name");
}

interface SchemaSections {
  description: string;
  fieldsLines: string[];
  relationshipLines: string[];
}

/** Split the markdown into description, fields, and relationships sections */
function splitSections(lines: string[]): SchemaSections {
  let currentSection: "pre" | "description" | "fields" | "relationships" =
    "pre";
  const descriptionLines: string[] = [];
  const fieldsLines: string[] = [];
  const relationshipLines: string[] = [];

  for (const line of lines) {
    // Check for section headings
    if (line.match(/^#\s+/)) {
      // H1 — entity name, switch to description
      currentSection = "description";
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match?.[1]) {
      const heading = h2Match[1].trim().toLowerCase();
      if (heading === "fields") {
        currentSection = "fields";
      } else if (heading === "relationships") {
        currentSection = "relationships";
      }
      continue;
    }

    // Accumulate lines into the current section
    switch (currentSection) {
      case "description":
        descriptionLines.push(line);
        break;
      case "fields":
        fieldsLines.push(line);
        break;
      case "relationships":
        relationshipLines.push(line);
        break;
    }
  }

  return {
    description: descriptionLines.join("\n").trim(),
    fieldsLines,
    relationshipLines: relationshipLines
      .map((l) => l.trim())
      .filter((l) => l.startsWith("-"))
      .map((l) => l.replace(/^-\s*/, "")),
  };
}

const FIELD_LINE_PATTERN = /^(\s*)-\s+\*\*(\w+)\*\*:\s*(.+)$/;
const SUB_ITEM_PATTERN = /^(\s+)-\s+(\w+)\s*\((.+)\)$/;

/** Parse field list items, handling indented sub-items */
function parseFieldLines(lines: string[]): RawField[] {
  const fields: RawField[] = [];
  let currentField: RawField | null = null;
  let baseIndent = -1;

  for (const line of lines) {
    // Try top-level field: - **name**: definition
    const fieldMatch = line.match(FIELD_LINE_PATTERN);
    if (fieldMatch) {
      const indent = fieldMatch[1]?.length ?? 0;

      // If this is a sub-field (indented deeper than the first field)
      if (baseIndent >= 0 && indent > baseIndent && currentField) {
        const name = fieldMatch[2] ?? "";
        const definition = fieldMatch[3] ?? "";
        currentField.subItems.push({ name, definition, subItems: [] });
        continue;
      }

      // New top-level field
      baseIndent = indent;
      currentField = {
        name: fieldMatch[2] ?? "",
        definition: fieldMatch[3] ?? "",
        subItems: [],
      };
      fields.push(currentField);
      continue;
    }

    // Try sub-item without bold: - name (definition)
    const subMatch = line.match(SUB_ITEM_PATTERN);
    if (subMatch && currentField) {
      const name = subMatch[2] ?? "";
      const definition = subMatch[3] ?? "";
      currentField.subItems.push({ name, definition, subItems: [] });
    }
  }

  return fields;
}
