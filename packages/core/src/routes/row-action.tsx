/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

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
  const flash = result.success ? "success" : "error";
  const msg = result.message ?? (result.success ? "action completed" : "action failed");

  // List-view forms send `_back=table` so we return them to the list, not detail.
  const backToTable = req.body?._back === "table";
  const target = backToTable
    ? `${ctx.prefix}/${table}`
    : `${ctx.prefix}/${table}/${pkParam}`;

  return redirect(`${target}?flash=${flash}&msg=${encodeURIComponent(msg)}`);
}
