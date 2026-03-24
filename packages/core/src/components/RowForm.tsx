import type { CellValue, Column, ColumnConfig, TableConfig } from "../types";

interface RowFormProps {
  columns: Column[];
  primaryKey: string[];
  values?: Record<string, CellValue>;
  action: string;
  submitLabel: string;
  /** Form id for external submit buttons. When set, hides the built-in submit. */
  formId?: string;
  /** Table config for display-type-aware editor inference. */
  tableConfig?: TableConfig;
}

/** Infer the best HTML input type from display config and column affinity. */
function resolveInputType(
  col: Column,
  cc: ColumnConfig | undefined,
): { type: string; useTextarea: boolean } {
  const display = cc?.display;

  // Display-type-aware defaults
  switch (display) {
    case "color":
      return { type: "color", useTextarea: false };
    case "datetime":
      return { type: "datetime-local", useTextarea: false };
    case "link":
    case "image":
      return { type: "url", useTextarea: false };
  }

  // Affinity-based fallback
  if (
    col.affinity === "integer" ||
    col.affinity === "real" ||
    col.affinity === "numeric"
  ) {
    return { type: "number", useTextarea: false };
  }

  return { type: "text", useTextarea: col.affinity === "text" };
}

function isLongText(value: unknown): boolean {
  return typeof value === "string" && value.length > 100;
}

export function RowForm({
  columns,
  primaryKey,
  values,
  action,
  submitLabel,
  formId,
  tableConfig,
}: RowFormProps) {
  const isEdit = !!values;
  const pkSet = new Set(primaryKey);

  return (
    <form method="post" action={action} class="tm-form" id={formId}>
      {columns.map((col) => {
        const val = values?.[col.name];
        const strVal = val === null || val === undefined ? "" : String(val);
        const isPk = pkSet.has(col.name);
        const readOnly = isPk && isEdit;
        const cc = tableConfig?.columns?.[col.name];
        const { type, useTextarea } = resolveInputType(col, cc);
        const shouldTextarea =
          useTextarea || isLongText(val);

        return (
          <div class="tm-field">
            <label for={`f-${col.name}`}>
              {col.name}
              {!col.nullable ? " *" : ""}
            </label>
            {shouldTextarea && !readOnly ? (
              <textarea
                id={`f-${col.name}`}
                name={col.name}
                required={!col.nullable && !isPk}
              >
                {strVal}
              </textarea>
            ) : (
              <input
                id={`f-${col.name}`}
                name={readOnly ? undefined : col.name}
                type={type}
                value={strVal}
                disabled={readOnly}
                required={!col.nullable && !isPk && !isEdit}
                placeholder={
                  col.defaultValue
                    ? `default: ${col.defaultValue}`
                    : undefined
                }
                step={type === "number" ? "any" : undefined}
              />
            )}
            <span class="tm-field-hint">
              {col.rawType || "TEXT"}
              {isPk ? " \u00B7 primary key" : ""}
              {col.defaultValue
                ? ` \u00B7 default: ${col.defaultValue}`
                : ""}
            </span>
          </div>
        );
      })}
      {!formId && (
        <div class="tm-actions">
          <button type="submit" class="tm-btn tm-btn-primary">
            {submitLabel}
          </button>
        </div>
      )}
    </form>
  );
}
