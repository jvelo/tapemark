import type { CellValue, Column } from "../types";

interface RowFormProps {
  columns: Column[];
  primaryKey: string[];
  values?: Record<string, CellValue>;
  action: string;
  submitLabel: string;
}

function inputType(col: Column): string {
  if (
    col.affinity === "integer" ||
    col.affinity === "real" ||
    col.affinity === "numeric"
  ) {
    return "number";
  }
  return "text";
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
}: RowFormProps) {
  const isEdit = !!values;
  const pkSet = new Set(primaryKey);

  return (
    <form method="post" action={action} class="tm-form">
      {columns.map((col) => {
        const val = values?.[col.name];
        const strVal = val === null || val === undefined ? "" : String(val);
        const isPk = pkSet.has(col.name);
        const readOnly = isPk && isEdit;
        const type = inputType(col);
        const useTextarea =
          isLongText(val) || col.affinity === "text";

        return (
          <div class="tm-field">
            <label for={`f-${col.name}`}>
              {col.name}
              {!col.nullable ? " *" : ""}
            </label>
            {useTextarea && !readOnly ? (
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
      <div class="tm-actions">
        <button type="submit" class="tm-btn tm-btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
