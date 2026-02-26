/** System fields automatically added to every record */
export interface SystemFields {
  _id: string;
  _created_at: string;
  _updated_at: string;
  _version: number;
}

/** A database record: user-defined fields + system fields */
export type Record = SystemFields & { [key: string]: unknown };

/** Supported database operations */
export const DB_OPERATIONS = [
  "create",
  "read",
  "update",
  "delete",
] as const;
export type DbOperation = (typeof DB_OPERATIONS)[number];

/** Write-ahead log entry */
export interface WalEntry {
  operation_id: string;
  operation: DbOperation;
  collection: string;
  record_id: string;
  previous_state: Record | null;
  new_state: Record | null;
  timestamp: string;
}

/** In-memory index: field value → array of record IDs */
export type FieldIndex = Map<string, string[]>;

/** Collection-level index map: field name → index */
export type CollectionIndexes = Map<string, FieldIndex>;

/** Persisted index file format */
export interface PersistedIndex {
  count: number;
  last_id: string | null;
  indexes: {
    [fieldName: string]: {
      [value: string]: string[];
    };
  };
}

/** Query filters: field name → expected value */
export interface QueryFilters {
  [field: string]: unknown;
}

/** Query options for list operations */
export interface QueryOptions {
  filters?: QueryFilters;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** Pagination metadata returned with list results */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
