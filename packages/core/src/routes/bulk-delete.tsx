/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { TableRepository } from "../repository";
import { assertWritable } from "./guard";
import { redirect } from "./response";
import type { TapemarkContext, TapemarkRequest, TapemarkResponse } from "../types";

export async function bulkDeleteRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = decodeURIComponent(req.params.table);
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
