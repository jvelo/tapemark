import { resolveEditor } from "../editor";
import type {
  CellValue,
  Column,
  ConstraintMode,
  DisplayType,
  EditorType,
  ForeignKey,
  TableConfig,
} from "../types";

interface RowFormProps {
  columns: Column[];
  primaryKey: string[];
  foreignKeys?: ForeignKey[];
  values?: Record<string, CellValue>;
  action: string;
  submitLabel: string;
  /** Form id for external submit buttons. When set, hides the built-in submit. */
  formId?: string;
  /** Table config — drives per-column display/editor selection. */
  tableConfig?: TableConfig;
  /** Display type registry — used for the display.defaultEditor hint. */
  displayTypes?: Map<string, DisplayType>;
  /** Editor type registry — used to render inputs. */
  editorTypes?: Map<string, EditorType>;
  /** URL prefix for resolving lookup endpoints. */
  prefix?: string;
  /** Constraint enforcement mode. When "relaxed", required attributes are skipped. */
  constraints?: ConstraintMode;
  /** When true, hides the submit button (view-only mode). */
  formReadonly?: boolean;
  /** Per-column autocomplete suggestions, rendered as a `<datalist>`. */
  suggestions?: Record<string, string[]>;
}

export function RowForm({
  columns,
  primaryKey,
  foreignKeys,
  values,
  action,
  submitLabel,
  formId,
  tableConfig,
  displayTypes,
  editorTypes,
  prefix,
  constraints = "enforce",
  formReadonly = false,
  suggestions,
}: RowFormProps) {
  const isEdit = !!values;
  const pkSet = new Set(primaryKey);
  const enforcing = constraints === "enforce";

  // Build a map from column name to its single-column FK
  const fkByColumn = new Map<string, ForeignKey>();
  for (const fk of foreignKeys ?? []) {
    if (fk.columns.length === 1) {
      fkByColumn.set(fk.columns[0], fk);
    }
  }

  return (
    <form method="post" action={action} class="tm-form" id={formId}>
      {prefix && (
        <script dangerouslySetInnerHTML={{ __html: `window.__tapemarkPrefix = ${JSON.stringify(prefix)};` }} />
      )}
      {columns.map((col) => {
        const val = values?.[col.name];
        const strVal = val === null || val === undefined ? "" : String(val);
        const isPk = pkSet.has(col.name);
        const readOnly = isPk && isEdit;
        const cc = tableConfig?.columns?.[col.name];
        const fk = fkByColumn.get(col.name);

        // Resolve editor for non-PK-on-edit case
        const { editor: editorName, options: editorOptions } = resolveEditor(
          col,
          cc,
          displayTypes,
          fk,
        );
        const editor = editorTypes?.get(editorName);

        const colSuggestions = suggestions?.[col.name];
        const fkHint = fk ? ` \u00B7 \u2192 ${fk.referencedTable}` : "";

        // Read-only PK on edit → plain disabled input
        if (readOnly) {
          return (
            <div class="tm-field">
              <label for={`f-${col.name}`}>
                {col.name}
                {enforcing && !col.nullable ? " *" : ""}
              </label>
              <input
                id={`f-${col.name}`}
                type="text"
                value={strVal}
                disabled
              />
              <span class="tm-field-hint">
                {col.rawType || "TEXT"}
                {" \u00B7 primary key"}
                {fkHint}
              </span>
            </div>
          );
        }

        // Render the editor
        const required = enforcing && !col.nullable && !isPk && !isEdit;
        const inputHtml = editor
          ? editor.render(col, val, editorOptions, { required })
          : `<input id="f-${col.name}" name="${col.name}" type="text" value="${strVal}" />`;

        return (
          <div class="tm-field">
            <label for={`f-${col.name}`}>
              {col.name}
              {enforcing && !col.nullable ? " *" : ""}
            </label>
            <div dangerouslySetInnerHTML={{ __html: inputHtml }} />
            {colSuggestions && (
              <datalist id={`tm-suggest-${col.name}`}>
                {colSuggestions.map((v) => <option value={v} />)}
              </datalist>
            )}
            <span class="tm-field-hint">
              {col.rawType || "TEXT"}
              {fkHint}
              {col.defaultValue
                ? ` \u00B7 default: ${col.defaultValue}`
                : ""}
            </span>
          </div>
        );
      })}
      {!formId && !formReadonly && (
        <div class="tm-actions">
          <button type="submit" class="tm-btn tm-btn-primary">
            {submitLabel}
          </button>
        </div>
      )}
    </form>
  );
}
