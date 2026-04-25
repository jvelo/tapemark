import { NotFoundError } from "../errors";
import { SchemaIntrospector } from "../schema";
import { decodePk } from "../repository";
import { runAction } from "../hooks";
import { assertWritable } from "./guard";
import { redirect } from "./response";
import type { TapemarkContext, TapemarkRequest, TapemarkResponse } from "../types";

export async function rowActionRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;
  const pkParam = req.params.pk;
  const actionName = req.params.actionName;
  assertWritable(table, ctx);

  const action = ctx.tableOptions.get(table)?.actions?.[actionName];
  if (!action) {
    throw new NotFoundError(
      `Action "${actionName}" is not registered on "${table}"`,
    );
  }

  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(table);
  const pkValues = decodePk(tableInfo.primaryKey, pkParam);

  const result = await runAction(table, actionName, pkValues, ctx, req);
  const flash = result.ok ? "success" : "error";
  const msg = result.message ?? (result.ok ? "action completed" : "action failed");

  // When the form posted from the table list view, return the user there
  // rather than to the row detail page they never opened.
  const backToTable = req.body?._back === "table";
  const target = backToTable
    ? `${ctx.prefix}/${table}`
    : `${ctx.prefix}/${table}/${pkParam}`;

  return redirect(`${target}?flash=${flash}&msg=${encodeURIComponent(msg)}`);
}
