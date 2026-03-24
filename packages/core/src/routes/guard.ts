import { TapemarkError } from "../errors";
import type { TapemarkContext } from "../types";

/**
 * Throws a 403 if the table is readonly (global, per-table, or view).
 * Call at the start of any mutation route handler.
 */
export function assertWritable(
  table: string,
  ctx: TapemarkContext,
  kind: "table" | "view" = "table",
): void {
  if (
    kind === "view" ||
    ctx.readonly ||
    ctx.tableOptions.get(table)?.readonly
  ) {
    throw new TapemarkError(403, "This table is read-only");
  }
}
