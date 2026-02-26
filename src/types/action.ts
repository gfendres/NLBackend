/** Tier classification for actions */
export const TIER_LEVELS = [1, 2, 3] as const;
export type TierLevel = (typeof TIER_LEVELS)[number];

/** Auth levels for actions */
export const AUTH_LEVELS = ["public", "authenticated", "role"] as const;
export type AuthLevel = (typeof AUTH_LEVELS)[number];

/** Parsed auth requirement from an action file */
export interface AuthRequirement {
  level: AuthLevel;
  /** Required role name, when level is "role" */
  role?: string;
}

/** A compiled action definition — exposed as an MCP tool */
export interface CompiledAction {
  /** MCP tool name (e.g. "recipes_create") */
  toolName: string;
  /** Human-readable title from the H1 heading */
  title: string;
  /** The "What it does" section as-is */
  description: string;
  /** Tier classification */
  tier: TierLevel;
  /** Auth requirement */
  auth: AuthRequirement;
  /** Input parameters extracted from the action file */
  inputs: ActionInput[];
  /** Output description */
  outputDescription: string;
  /** Error definitions */
  errors: ActionError[];
  /** The entity this action operates on (derived from folder name) */
  entity: string;
  /** Path to the source markdown file */
  sourcePath: string;
}

/** A single input parameter for an action */
export interface ActionInput {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

/** An error definition for an action */
export interface ActionError {
  code: string;
  description: string;
}
