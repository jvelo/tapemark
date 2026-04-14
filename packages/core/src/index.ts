// Types
export type {
  CellValue,
  Column,
  ColumnAffinity,
  ColumnConfig,
  ConstraintMode,
  Database,
  DisplayType,
  EditorRenderFlags,
  EditorType,
  ForeignKey,
  OptionSchema,
  PreparedStatement,
  RequestOverrides,
  RouteHandler,
  TapemarkBaseOptions,
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
  ThemeName,
} from "./types";

// Themes
export { themes, defaultTheme } from "./themes";
export type { ThemeDefinition } from "./themes";

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

// Editor types
export {
  builtinEditorTypes,
  createEditorTypeRegistry,
} from "./editor";

// Lookup
export { pickLabelColumn } from "./routes/lookup";

// Core
export { createTapemark } from "./router";
export type { TapemarkCore } from "./router";

// Layout primitives
export { TapemarkLayout } from "./components/TapemarkLayout";
export type { Crumb } from "./components/TapemarkLayout";
export { renderPage } from "./render";

// Database list page
export { renderDatabaseListPage } from "./database-list.jsx";
export type { DatabaseListItem } from "./components/DatabaseListPage";
