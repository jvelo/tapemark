import { escapeHtml } from "../html";
import { isActionVisibleFor } from "../hooks";
import type { CellValue, Column, ColumnConfig, DisplayType, RowAction, TableConfig } from "../types";

interface DataTableProps {
  columns: Column[];
  primaryKey: string[];
  rows: Record<string, CellValue>[];
  linkBase: string;
  encodePk: (row: Record<string, CellValue>) => string;
  tableConfig: TableConfig;
  displayTypes: Map<string, DisplayType>;
  page?: number;
  pageSize?: number;
  /** "table" enables edit links and bulk select; "view" enables read-only row links. */
  kind?: "table" | "view";
  /** Actions registered on this table; only those with `display.list: true` render here. */
  actions?: Record<string, RowAction>;
}

function renderCellContent(
  value: CellValue,
  config: ColumnConfig,
  displayTypes: Map<string, DisplayType>,
): string {
  if (value === null || value === undefined) {
    return '<span class="tm-cell-null">null</span>';
  }
  if (value === "") {
    return '<span class="tm-cell-empty">(empty)</span>';
  }

  const displayName = config.display || "text";
  const displayType = displayTypes.get(displayName);
  if (displayType) {
    return displayType.render(value, config.options ?? {});
  }

  // Fallback: plain text truncation
  const str = String(value);
  const truncated = str.length > 80 ? str.slice(0, 80) + "…" : str;
  return escapeHtml(truncated);
}

export function DataTable({
  columns,
  primaryKey,
  rows,
  linkBase,
  encodePk,
  tableConfig,
  displayTypes,
  page = 1,
  pageSize = 50,
  kind = "table",
  actions,
}: DataTableProps) {
  const pkSet = new Set(primaryKey);
  const hasPk = primaryKey.length > 0;
  const isView = kind === "view";

  const visibleColumns = columns.filter((col) => {
    const cc = tableConfig.columns?.[col.name];
    return !cc?.hidden;
  });

  // Per-row actions exposed in the list view (opt-in via `display.list`).
  const tableActions = Object.entries(actions ?? {}).filter(([, a]) => a.display?.list === true);
  const hasTableActions = hasPk && !isView && tableActions.length > 0;

  if (rows.length === 0) {
    return <p class="tm-empty">empty table</p>;
  }

  return (
    <div class="tm-table-scroll">
    <form method="post" action={`${linkBase}/_bulk-delete`} id="tm-bulk-form">
      <input type="hidden" name="page" value={String(page)} />
      <table>
        <thead>
          <tr>
            {visibleColumns.map((col) => {
              const cc = tableConfig.columns?.[col.name];
              return (
                <th class={pkSet.has(col.name) ? "tm-pk-col" : ""}>
                  {cc?.label || col.name}
                  {pkSet.has(col.name) && " ●"}
                </th>
              );
            })}
            {hasTableActions && <th class="tm-row-action-col">actions</th>}
            {hasPk && !isView && (
              <th class="tm-select-col">
                <input type="checkbox" class="tm-row-select" id="tm-select-all" />
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowLink = hasPk && !isView
              ? `${linkBase}/${encodePk(row)}`
              : `${linkBase}/_row/${(page - 1) * pageSize + index}`;
            const pk = hasPk ? encodePk(row) : "";
            return (
              <tr>
                {visibleColumns.map((col) => {
                  const val = row[col.name];
                  const cc = tableConfig.columns?.[col.name] ?? {};
                  const html = renderCellContent(val, cc, displayTypes);
                  return (
                    <td>
                      <a
                        href={rowLink}
                        dangerouslySetInnerHTML={{ __html: html }}
                      />
                    </td>
                  );
                })}
                {hasTableActions && (
                  <td class="tm-row-action-col">
                    {tableActions
                      .filter(([, action]) => isActionVisibleFor(action, row))
                      .map(([name, action]) => (
                        <button
                          type="submit"
                          form={`tm-act-${pk}-${name}`}
                          class="tm-btn tm-btn-sm"
                        >
                          {action.label}
                        </button>
                      ))}
                  </td>
                )}
                {hasPk && !isView && (
                  <td class="tm-select-col">
                    <input
                      type="checkbox"
                      name="pk"
                      value={encodePk(row)}
                      class="tm-row-select"
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </form>
    {/* Action forms live outside the bulk-delete form (HTML disallows
        nested forms); table buttons reach them via the `form="..."` attribute. */}
    {hasTableActions && rows.map((row) => {
      const pk = encodePk(row);
      return tableActions
        .filter(([, action]) => isActionVisibleFor(action, row))
        .map(([name]) => (
          <form
            method="post"
            action={`${linkBase}/${pk}/_action/${name}`}
            id={`tm-act-${pk}-${name}`}
            class="tm-table-action-form"
          >
            <input type="hidden" name="_back" value="table" />
          </form>
        ));
    })}
    </div>
  );
}
