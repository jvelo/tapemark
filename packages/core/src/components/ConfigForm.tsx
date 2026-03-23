import type { Column, ColumnConfig, DisplayType, TableConfig } from "../types";

interface ConfigFormProps {
  table: string;
  prefix: string;
  columns: Column[];
  config: TableConfig;
  displayTypes: Map<string, DisplayType>;
}

export function ConfigForm({
  table,
  prefix,
  columns,
  config,
  displayTypes,
}: ConfigFormProps) {
  const displayOptions = Array.from(displayTypes.keys());

  return (
    <form
      method="post"
      action={`${prefix}/${table}/_config`}
      class="tm-form tm-form-wide"
    >
      <table>
        <thead>
          <tr>
            <th>column</th>
            <th>type</th>
            <th>display</th>
            <th>label</th>
            <th>hidden</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => {
            const cc: ColumnConfig = config.columns?.[col.name] ?? {};
            return (
              <tr>
                <td>{col.name}</td>
                <td class="tm-muted">{col.rawType || "TEXT"}</td>
                <td>
                  <select name={`${col.name}__display`}>
                    {displayOptions.map((opt) => (
                      <option value={opt} selected={cc.display === opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
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
