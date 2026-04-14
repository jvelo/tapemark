import { SchemaIntrospector } from "./schema";
import { pickLabelColumn } from "./routes/lookup";
import type { CellValue, Database, ForeignKey, TableConfig } from "./types";

/**
 * For each single-column FK, batch-resolve the referenced labels for all
 * values present in the given rows. Returns a new TableConfig with `_labels`
 * and `_refTable` injected into the column options.
 */
export async function resolveReferenceLabels(
  db: Database,
  foreignKeys: ForeignKey[],
  rows: Record<string, CellValue>[],
  tableConfig: TableConfig,
  prefix: string,
): Promise<TableConfig> {
  const singleColFks = foreignKeys.filter((fk) => fk.columns.length === 1);
  if (singleColFks.length === 0) return tableConfig;

  const introspector = new SchemaIntrospector(db);
  const merged: TableConfig = {
    columns: { ...tableConfig.columns },
  };

  for (const fk of singleColFks) {
    const colName = fk.columns[0];
    const cc = merged.columns?.[colName];

    // Only resolve for columns that use reference display (explicit or auto)
    const isExplicitRef = cc?.display === "reference";
    const isAutoRef = !cc?.display;
    if (!isExplicitRef && !isAutoRef) continue;

    // Collect unique non-null FK values from the page
    const values = new Set<CellValue>();
    for (const row of rows) {
      const v = row[colName];
      if (v !== null && v !== undefined && v !== "") values.add(v);
    }
    if (values.size === 0) continue;

    // Introspect the referenced table to find its label column
    let refTable;
    try {
      refTable = await introspector.getTable(fk.referencedTable);
    } catch {
      continue;
    }

    const labelColumnOverride = cc?.displayOptions?.labelColumn as string | undefined;
    const labelColumn = labelColumnOverride ?? pickLabelColumn(refTable);
    const valueColumn = fk.referencedColumns[0];

    // Batch query
    const placeholders = [...values].map(() => "?").join(", ");
    const selectCols = [`"${valueColumn}" as value`];
    if (labelColumn && labelColumn !== valueColumn) {
      selectCols.push(`"${labelColumn}" as label`);
    }

    const sql = `SELECT ${selectCols.join(", ")} FROM "${fk.referencedTable}" WHERE "${valueColumn}" IN (${placeholders})`;
    const refRows = await db
      .prepare(sql)
      .bind(...values)
      .all<{ value: unknown; label?: unknown }>();

    const labels: Record<string, string> = {};
    for (const r of refRows) {
      labels[String(r.value)] = r.label !== undefined ? String(r.label) : String(r.value);
    }

    merged.columns = merged.columns ?? {};
    merged.columns[colName] = {
      ...cc,
      display: cc?.display ?? "reference",
      displayOptions: {
        ...cc?.displayOptions,
        table: `${prefix}/${fk.referencedTable}`,
        _refTable: fk.referencedTable,
        _labels: labels,
      },
    };
  }

  return merged;
}
