import { resolveEditor } from "../editor";
import type {
  Column,
  ColumnConfig,
  DisplayType,
  EditorType,
  ForeignKey,
  TableConfig,
} from "../types";

interface ConfigFormProps {
  table: string;
  prefix: string;
  columns: Column[];
  foreignKeys?: ForeignKey[];
  /**
   * Pre-computed inferred options per column, keyed by column name.
   * Produced by the route (sync inference + editor.inferOptions). Shown as
   * "inferred" hints in the UI when they fill in un-stored keys.
   */
  inferredOptionsByColumn?: Record<string, Record<string, unknown>>;
  config: TableConfig;
  displayTypes: Map<string, DisplayType>;
  editorTypes: Map<string, EditorType>;
}

export function ConfigForm({
  table,
  prefix,
  columns,
  foreignKeys,
  inferredOptionsByColumn,
  config,
  displayTypes,
  editorTypes,
}: ConfigFormProps) {
  const displayOptionsList = Array.from(displayTypes.keys());
  const editorOptionsList = Array.from(editorTypes.keys());

  // Single-column FK lookup, for editor inference
  const fkByColumn = new Map<string, ForeignKey>();
  for (const fk of foreignKeys ?? []) {
    if (fk.columns.length === 1) {
      fkByColumn.set(fk.columns[0], fk);
    }
  }

  // Serialize schemas for the web components
  const displaySchemas: Record<string, unknown> = {};
  for (const [name, dt] of displayTypes) {
    displaySchemas[name] = dt.schema;
  }
  const editorSchemas: Record<string, unknown> = {};
  for (const [name, et] of editorTypes) {
    editorSchemas[name] = et.schema;
  }

  return (
    <form
      method="post"
      action={`${prefix}/${table}/_config`}
      class="tm-form tm-form-wide"
    >
      <script
        type="application/json"
        id="tm-display-schemas"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(displaySchemas) }}
      />
      <script
        type="application/json"
        id="tm-editor-schemas"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(editorSchemas) }}
      />
      <table>
        <thead>
          <tr>
            <th>column</th>
            <th>type</th>
            <th>display</th>
            <th>display options</th>
            <th>editor</th>
            <th>editor options</th>
            <th>label</th>
            <th>hidden</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => {
            const cc: ColumnConfig = config.columns?.[col.name] ?? {};
            const displayOptsJson = JSON.stringify(cc.displayOptions ?? {});

            // Infer the editor (and its defaults) as if cc.editor were unset
            const inferred = resolveEditor(
              col,
              { ...cc, editor: undefined },
              displayTypes,
              fkByColumn.get(col.name),
            );
            const selectedEditor = cc.editor ?? inferred.editor;

            // Inferred options only apply when the selected editor matches
            // the inferred one. Otherwise the key set is different.
            const inferredOptions: Record<string, unknown> =
              selectedEditor === inferred.editor
                ? inferredOptionsByColumn?.[col.name] ?? inferred.options
                : {};
            const storedOptions = cc.editorOptions ?? {};
            const effectiveOptions = { ...inferredOptions, ...storedOptions };
            const inferredKeys = Object.keys(inferredOptions).filter(
              (k) => !(k in storedOptions),
            );
            const editorOptsJson = JSON.stringify(effectiveOptions);
            const inferredKeysJson = JSON.stringify(inferredKeys);
            return (
              <tr>
                <td>{col.name}</td>
                <td class="tm-muted">{col.rawType || "TEXT"}</td>
                <td>
                  <select name={`${col.name}__display`}>
                    {displayOptionsList.map((opt) => (
                      <option value={opt} selected={cc.display === opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <tm-schema-options
                    data-column={col.name}
                    data-kind="display"
                    data-options={displayOptsJson}
                  />
                </td>
                <td>
                  <select name={`${col.name}__editor`}>
                    {editorOptionsList.map((opt) => (
                      <option value={opt} selected={selectedEditor === opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <tm-schema-options
                    data-column={col.name}
                    data-kind="editor"
                    data-options={editorOptsJson}
                    data-inferred-keys={inferredKeysJson}
                  />
                </td>
                <td>
                  <input
                    name={`${col.name}__label`}
                    value={cc.label || ""}
                    placeholder={col.name}
                  />
                </td>
                <td class="tm-center">
                  <input
                    name={`${col.name}__hidden`}
                    type="checkbox"
                    checked={!!cc.hidden}
                    value="1"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div class="tm-actions">
        <button type="submit" class="tm-btn tm-btn-primary">
          save config
        </button>
        <a href={`${prefix}/${table}`} class="tm-btn">
          cancel
        </a>
      </div>
    </form>
  );
}
