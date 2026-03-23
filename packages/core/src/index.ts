// Types
export type {
  CellValue,
  Column,
  ColumnAffinity,
  ColumnConfig,
  Database,
  DisplayType,
  OptionSchema,
  PreparedStatement,
  RouteHandler,
  RowData,
  RowResult,
  Schema,
  Table,
  TableConfig,
  TableOptions,
  TapemarkContext,
  TapemarkOptions,
  TapemarkRequest,
  TapemarkResponse,
} from "./types";

// Errors
export { NotFoundError, TapemarkError, ValidationError } from "./errors";

// Schema introspection
export {
  isInternalTable,
  NameValidationError,
  parseAffinity,
  SchemaIntrospector,
} from "./schema";

// Repository
export {
  castValue,
  decodePk,
  encodePk,
  TableRepository,
} from "./repository";

// Config
export { ConfigStore } from "./config";

// Migrator
export { TapemarkMigrator } from "./migrator";

// Display types
export {
  builtinDisplayTypes,
  createDisplayTypeRegistry,
} from "./display";

// Core
export { createAdminCore } from "./router";
export type { TapemarkCore } from "./router";
