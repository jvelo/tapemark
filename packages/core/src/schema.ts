import { NotFoundError } from "./errors";
import { computeHash } from "./hash";
import type { Column, ColumnAffinity, Database, Schema, Table } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAFE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Tables that should never appear in the admin UI. */
const INTERNAL_PREFIXES = ["_tapemark_", "_cf_", "sqlite_"];
const INTERNAL_NAMES = new Set([
  "_cf_METADATA",
  "d1_migrations",
  "sqlite_sequence",
]);

// ---------------------------------------------------------------------------
// Affinity parsing (SQLite rules: https://www.sqlite.org/datatype3.html)
// ---------------------------------------------------------------------------

export function parseAffinity(rawType: string): ColumnAffinity {
  const upper = rawType.toUpperCase();
  if (upper.includes("INT")) return "integer";
  if (
    upper.includes("CHAR") ||
    upper.includes("CLOB") ||
    upper.includes("TEXT")
  )
    return "text";
  if (upper.includes("BLOB") || upper === "") return "blob";
  if (
    upper.includes("REAL") ||
    upper.includes("FLOA") ||
    upper.includes("DOUB")
  )
    return "real";
  return "numeric";
}

// ---------------------------------------------------------------------------
// Name validation
// ---------------------------------------------------------------------------

export function isInternalTable(name: string): boolean {
  if (INTERNAL_NAMES.has(name)) return true;
  return INTERNAL_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export class NameValidationError extends NotFoundError {
  constructor(
    public readonly kind: "table" | "column",
    public readonly invalidName: string,
  ) {
    super(
      `${kind} not found: ${invalidName}`,
      `Validated against sqlite_master`,
    );
    this.name = "NameValidationError";
  }
}

// ---------------------------------------------------------------------------
// SchemaIntrospector
// ---------------------------------------------------------------------------

/** Raw PRAGMA table_info row. */
interface PragmaColumnRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export class SchemaIntrospector {
  constructor(private db: Database) {}

  /** All user-facing table names (excludes internal tables). */
  async getTableNames(): Promise<string[]> {
    const stmt = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const rows = await stmt.all<{ name: string }>();
    return rows
      .map((r) => r.name)
      .filter((n) => !isInternalTable(n));
  }

  /** Validate that a table name exists and is safe to use in SQL. */
  async assertTable(name: string): Promise<void> {
    if (!SAFE_NAME.test(name)) {
      throw new NameValidationError("table", name);
    }
    const tables = await this.getTableNames();
    if (!tables.includes(name)) {
      throw new NameValidationError("table", name);
    }
  }

  /** Validate that a column belongs to the given table. */
  async assertColumn(table: string, column: string): Promise<void> {
    if (!SAFE_NAME.test(column)) {
      throw new NameValidationError("column", column);
    }
    const info = await this.getTable(table);
    if (!info.columns.some((c) => c.name === column)) {
      throw new NameValidationError("column", column);
    }
  }

  /** Full column and PK info for a single table. */
  async getTable(name: string): Promise<Table> {
    await this.assertTable(name);

    const pragmaRows = await this.db
      .prepare(`PRAGMA table_info("${name}")`)
      .all<PragmaColumnRow>();

    const columns: Column[] = pragmaRows.map((row) => ({
      name: row.name,
      rawType: row.type,
      affinity: parseAffinity(row.type),
      nullable: row.notnull === 0,
      defaultValue: row.dflt_value,
      primaryKeyPosition: row.pk > 0 ? row.pk : null,
    }));

    const primaryKey = columns
      .filter((c) => c.primaryKeyPosition !== null)
      .sort((a, b) => a.primaryKeyPosition! - b.primaryKeyPosition!)
      .map((c) => c.name);

    const countRow = await this.db
      .prepare(`SELECT COUNT(*) as cnt FROM "${name}"`)
      .first<{ cnt: number }>();

    return {
      name,
      columns,
      primaryKey,
      rowCount: countRow?.cnt ?? 0,
    };
  }

  /** All user-facing tables with column info and row counts. */
  async getTables(): Promise<Table[]> {
    const names = await this.getTableNames();
    return Promise.all(names.map((n) => this.getTable(n)));
  }

  /**
   * Full schema snapshot including a hash for sync compatibility.
   * The hash is computed from the sorted CREATE TABLE statements.
   */
  async getSchema(): Promise<Schema> {
    const tables = await this.getTables();

    const createStmts = await this.db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name",
      )
      .all<{ sql: string }>();

    const concatenated = createStmts.map((r) => r.sql).join("\n");
    const hash = await computeHash(concatenated);

    return { tables, hash };
  }
}

