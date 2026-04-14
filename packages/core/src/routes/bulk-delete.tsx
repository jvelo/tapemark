import { TableRepository } from "../repository";
import { assertWritable } from "./guard";
import { redirect } from "./response";
import type { TapemarkContext, TapemarkRequest, TapemarkResponse } from "../types";

export async function bulkDeleteRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;
  assertWritable(table, ctx);
  const repo = new TableRepository(ctx.db);

  let pks: string[] = [];
  if (req.body) {
    const raw = req.body.pk;
    pks = Array.isArray(raw) ? raw : raw ? [raw] : [];
  }

  const deleted = await repo.bulkDelete(table, pks);
  const page = (req.body?.page as string) || "1";

  return redirect(`${ctx.prefix}/${table}?page=${page}&flash=success&msg=${encodeURIComponent(`${deleted} row${deleted === 1 ? "" : "s"} deleted`)}`);
}
