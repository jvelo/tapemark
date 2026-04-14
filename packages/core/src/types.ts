// ---------------------------------------------------------------------------
// Database adapter interface
// ---------------------------------------------------------------------------

/**
 * Minimal database interface that both D1 and native SQLite can implement.
 * Adapters wrap the underlying driver to match this shape.
 */
export interface Database {
  prepare(query: string): PreparedStatement;
}

export interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<T[]>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

/** SQLite type affinity, parsed from the raw column type string. */
export type ColumnAffinity = "text" | "numeric" | "integer" | "real" | "blob";

export interface Column {
  name: string;
  /** Raw type string from SQLite (e.g. "VARCHAR(255)", "INTEGER"). */
  rawType: string;
  /** Parsed affinity. */
  affinity: ColumnAffinity;
  nullable: boolean;
  defaultValue: string | null;
  /**
   * Position in the primary key (1-based), or `null` if the column is not
   * part of the primary key.
   */
  primaryKeyPosition: number | null;
}

export interface ForeignKey {
  /** Local column names, ordered by position in the constraint. */
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onUpdate: string;
  onDelete: string;
}

export interface Table {
  name: string;
  /** Whether this is a table or a view. */
  kind: "table" | "view";
  /** Whether the table has an implicit rowid column. False for views and WITHOUT ROWID tables. */
  hasRowid: boolean;
  columns: Column[];
  /** Ordered list of primary key column names. */
  primaryKey: string[];
  foreignKeys: ForeignKey[];
  rowCount: number;
}

export interface Schema {
  tables: Table[];
  /** SHA-256 hash of the sorted CREATE TABLE statements. */
  hash: string;
}

// ---------------------------------------------------------------------------
// Cell / row types
// ---------------------------------------------------------------------------

export type CellValue = string | number | null | Uint8Array;

export interface RowResult {
  columns: Column[];
  rows: Record<string, CellValue>[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RowData {
  values: Map<string, CellValue>;
  primaryKey: Map<string, CellValue>;
}

// ---------------------------------------------------------------------------
// Display types
// ---------------------------------------------------------------------------

/** JSON Schema subset used for display type option definitions. */
export interface OptionSchema {
  type: "object";
  properties: Record<
    string,
    {
      type: "string" | "number" | "boolean";
      default?: unknown;
      description?: string;
      enum?: unknown[];
    }
  >;
}

export interface DisplayType {
  name: string;
  description: string;
  /** JSON Schema describing the configurable options. */
  schema: OptionSchema;
  /** Server-side: render a cell value to an HTML string. */
  render: (value: unknown, options: Record<string, unknown>) => string;
  /**
   * Name of the editor to use by default when this display is set and no
   * explicit editor is configured. Falls back to affinity-based inference.
   */
  defaultEditor?: string;
}

// ---------------------------------------------------------------------------
// Editor types
// ---------------------------------------------------------------------------

export interface EditorRenderFlags {
  /** Emit the HTML `required` attribute. */
  required?: boolean;
}

export interface EditorType {
  name: string;
  description: string;
  /** JSON Schema describing the configurable options. */
  schema: OptionSchema;
  /**
   * Server-side: render the HTML form input for editing a value.
   * Called with the column, current value (or undefined for new rows),
   * editor options merged with defaults, and flags set by the RowForm.
   */
  render: (
    column: Column,
    value: unknown,
    options: Record<string, unknown>,
    flags?: EditorRenderFlags,
  ) => string;
  /**
   * Optional: compute option values inferred from the column's context.
   * Called at config-form-render time; may query the database to discover
   * defaults (e.g. the reference editor looks up the referenced table's
   * label column). Returned values are shown as "inferred" in the UI.
   */
  inferOptions?: (ctx: {
    column: Column;
    fk?: ForeignKey;
    db: Database;
  }) => Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Table configuration (stored in _tapemark_table_config)
// ---------------------------------------------------------------------------

/** Paired `type` + `options` for a configured concern (display or editor). */
export interface Configured<Opts = Record<string, unknown>> {
  type: string;
  options?: Opts;
}

export interface ColumnConfig {
  display?: Configured;
  editor?: Configured;
  label?: string;
  hidden?: boolean;
}

export interface TableConfig {
  columns?: Record<string, ColumnConfig>;
}

// ---------------------------------------------------------------------------
// Core request / response
// ---------------------------------------------------------------------------

export interface TapemarkRequest {
  method: string;
  /** Path relative to the mount point (e.g. "/users", "/users/42"). */
  path: string;
  /** Route parameters extracted from path patterns (e.g. { table: "users", pk: "42" }). */
  params: Record<string, string>;
  /** URL query string parameters. */
  query: Record<string, string>;
  body?: Record<string, string | string[]>;
}

export interface TapemarkResponse {
  status: number;
  headers: Record<string, string>;
  html?: string;
  redirect?: string;
}

export interface RequestOverrides {
  /** Pre-resolved database for this request (bypasses options.db). */
  db?: Database;
}

/** A route handler is a pure async function. */
export type RouteHandler = (
  req: TapemarkRequest,
  ctx: TapemarkContext,
) => Promise<TapemarkResponse>;

// ---------------------------------------------------------------------------
// Options & context
// ---------------------------------------------------------------------------

export interface TableOptions {
  readonly?: boolean;
  hidden?: boolean;
}

/**
 * Base configuration shared by direct users and adapters.
 * Adapters extend this to add framework-specific fields (like a
 * context-aware `db` accessor) while `createTapemark` accepts it
 * directly when the database is provided per-request via overrides.
 */
export interface TapemarkBaseOptions {
  /** Authorization callback. If omitted, the panel is unprotected. */
  authorize?: (req: TapemarkRequest) => Promise<boolean>;
  /** URL prefix for generating internal links (e.g. "/admin"). */
  prefix?: string;
  /** Custom display type definitions. */
  displayTypes?: Record<string, DisplayType>;
  /** Custom editor type definitions. */
  editorTypes?: Record<string, EditorType>;
  /** Per-table overrides. */
  tables?: Record<string, TableOptions>;
  /** Additional client-side scripts to load. */
  scripts?: string[];
  /** URL to link back to the host site. */
  siteUrl?: string;
  /** Label for the site link (e.g. "jvelo.at"). Defaults to "site". */
  siteName?: string;
  /** Display name shown in the top-left of the bar. Defaults to "tapemark". */
  name?: string;
  /**
   * Brand mark (emoji or short string) rendered before `name` and used as favicon.
   * Defaults to "🎞️" when `name` is not set, and to `false` when `name` is customized —
   * i.e. integrators who rebrand don't get tapemark's mark by accident. Pass a string
   * to override, or `false` to hide explicitly.
   */
  symbol?: string | false;
  /** Global read-only mode — disables all writes and deletes. */
  readonly?: boolean;
  /** Set to false to skip bundled fonts (when the host app already serves them). Defaults to true. */
  bundleFonts?: boolean;
  /** Theme name. Defaults to "hubot". */
  theme?: ThemeName;
  /** Constraint enforcement mode. Defaults to "enforce". */
  constraints?: ConstraintMode;
}

/** Full options for direct usage — `db` is required. */
export interface TapemarkOptions extends TapemarkBaseOptions {
  /** Database instance or factory. */
  db: Database | (() => Database);
}

export type ThemeName = "hubot" | "plex" | "depart";

/** "enforce" enables FK checks and HTML required attributes. "relaxed" disables both. */
export type ConstraintMode = "enforce" | "relaxed";

/**
 * Context passed to route handlers. Built once per request from
 * resolved options. Handlers never touch raw options.
 */
export interface TapemarkContext {
  db: Database;
  prefix: string;
  siteUrl?: string;
  siteName: string;
  name: string;
  symbol: string | false;
  readonly: boolean;
  constraints: ConstraintMode;
  theme: ThemeName;
  bundleFonts: boolean;
  displayTypes: Map<string, DisplayType>;
  editorTypes: Map<string, EditorType>;
  tableOptions: Map<string, TableOptions>;
  scripts: string[];
}
