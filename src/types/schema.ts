/** Field types recognized by the schema compiler */
export const FIELD_TYPES = [
  "string",
  "number",
  "boolean",
  "date",
  "enum",
  "array",
  "object",
  "reference",
  "uuid",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** Auto-generation strategies for fields */
export const AUTO_STRATEGIES = ["uuid", "timestamp"] as const;
export type AutoStrategy = (typeof AUTO_STRATEGIES)[number];

/** Relationship types between entities */
export const RELATIONSHIP_TYPES = [
  "belongs_to",
  "has_many",
  "has_one",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** A single field definition within a schema */
export interface FieldDefinition {
  name: string;
  type: FieldType;
  required: boolean;
  unique: boolean;
  indexed: boolean;
  immutable: boolean;
  auto?: AutoStrategy;
  default?: unknown;
  enumValues?: string[];
  min?: number;
  max?: number;
  referenceTo?: string;
  /** For array/object fields: the nested field definitions */
  items?: FieldDefinition[];
  /** Raw description text for items that couldn't be fully parsed */
  description?: string;
}

/** A relationship between two entities */
export interface Relationship {
  type: RelationshipType;
  entity: string;
  via?: string;
}

/** The compiled output of a schema markdown file */
export interface CompiledSchema {
  entity: string;
  description: string;
  fields: FieldDefinition[];
  relationships: Relationship[];
  /** Path to the source markdown file (relative to project root) */
  sourcePath: string;
}
