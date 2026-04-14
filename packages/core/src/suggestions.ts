import { TableRepository } from "./repository";
import type { Column, Database, TableConfig } from "./types";

/**
 * For every column whose configured editor has `suggest: true` in its
 * editor options, fetch the distinct existing values. Only applies when
 * the `text` editor is explicitly selected (the only editor that honors
 * `suggest` today). Columns without suggest are omitted.
 */
export async function resolveSuggestions(
  db: Database,
  table: string,
  columns: Column[],
  tableConfig: TableConfig | undefined,
  limit = 1000,
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  if (!tableConfig?.columns) return out;

  const repo = new TableRepository(db);
  for (const col of columns) {
    const cc = tableConfig.columns[col.name];
    if (cc?.editor?.type !== "text") continue;
    if (cc.editor.options?.suggest !== true) continue;
    out[col.name] = await repo.getDistinctValues(table, col.name, limit);
  }
  return out;
}
