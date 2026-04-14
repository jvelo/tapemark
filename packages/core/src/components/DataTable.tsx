import { escapeHtml } from "../html";
import type { CellValue, Column, ColumnConfig, DisplayType, TableConfig } from "../types";

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
  const truncated = str.length > 80 ? str.slice(0, 80) + "\u2026" : str;
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
}: DataTableProps) {
  const pkSet = new Set(primaryKey);
  const hasPk = primaryKey.length > 0;
  const isView = kind === "view";

  const visibleColumns = columns.filter((col) => {
    const cc = tableConfig.columns?.[col.name];
    return !cc?.hidden;
  });

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
                  {pkSet.has(col.name) && " \u25CF"}
                </th>
              );
            })}
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
    </div>
  );
}
