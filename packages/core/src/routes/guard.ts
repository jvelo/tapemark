/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

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
