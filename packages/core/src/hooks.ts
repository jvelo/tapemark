/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { TableRepository } from "./repository";
import type {
  ActionContext,
  CellValue,
  HookContext,
  RowAction,
  RowPatch,
  TableHooks,
  TapemarkContext,
  TapemarkRequest,
} from "./types";

/** Build a HookContext from the current request — shared by hooks and actions. */
function buildHookContext(
  ctx: TapemarkContext,
  req: TapemarkRequest,
): HookContext {
  const executionContext = ctx.executionContext;
  return {
    db: ctx.db,
    env: ctx.env,
    request: req,
    background: async (work) => {
      if (executionContext?.waitUntil) {
        executionContext.waitUntil(work);
        return;
      }
      await work;
    },
  };
}

function getHooks(table: string, ctx: TapemarkContext): TableHooks | undefined {
  return ctx.tableOptions.get(table)?.hooks;
}

/** Build the ActionContext: a HookContext plus `update`, the guarded partial
 *  write to the action's row that also fires `afterUpdate`. A hook that fails
 *  during a write is pushed onto `warnings` rather than thrown — the row write
 *  has already committed — so the caller can fold it into the flash. */
function buildActionContext(
  ctx: TapemarkContext,
  req: TapemarkRequest,
  action: RowAction,
  table: string,
  pkValues: Record<string, string>,
  warnings: string[],
): ActionContext {
  const repo = new TableRepository(ctx.db);
  return {
    ...buildHookContext(ctx, req),
    update: async (values) => {
      if (action.writes) {
        assertOwnedColumns(action.writes, values, Object.keys(pkValues));
      }
      const patch = await repo.patchRow(table, pkValues, values);
      const hookError = await fireAfterUpdate(table, pkValues, patch, ctx, req);
      if (hookError) warnings.push(hookError);
    },
  };
}

/** Reject any non-PK column in `values` outside the action's declared `writes`.
 *  PK columns are exempt: `patchRow` ignores them, so the contract treats them
 *  as no-ops rather than ownership violations. */
function assertOwnedColumns(
  writes: string[],
  values: Record<string, CellValue>,
  pkColumns: string[],
): void {
  const owned = new Set(writes);
  const pk = new Set(pkColumns);
  const stray = Object.keys(values).filter(
    (key) => !owned.has(key) && !pk.has(key),
  );
  if (stray.length > 0) {
    throw new Error(
      `update: column(s) not in this action's \`writes\`: ${stray.join(", ")}`,
    );
  }
}

/** Run a hook; return null on success or an error message on failure.
 *  Never throws — the row write has already committed by the time we're here. */
async function runHook(fn: () => Promise<void> | void): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function fireAfterInsert(
  table: string,
  row: Record<string, CellValue>,
  ctx: TapemarkContext,
  req: TapemarkRequest,
): Promise<string | null> {
  const hook = getHooks(table, ctx)?.afterInsert;
  if (!hook) return null;
  return runHook(() => hook(row, buildHookContext(ctx, req)));
}

export async function fireAfterUpdate(
  table: string,
  pkValues: Record<string, string>,
  patch: RowPatch,
  ctx: TapemarkContext,
  req: TapemarkRequest,
): Promise<string | null> {
  const hook = getHooks(table, ctx)?.afterUpdate;
  if (!hook) return null;
  return runHook(() => hook(pkValues, patch, buildHookContext(ctx, req)));
}

export async function fireAfterDelete(
  table: string,
  pkValues: Record<string, string>,
  ctx: TapemarkContext,
  req: TapemarkRequest,
): Promise<string | null> {
  const hook = getHooks(table, ctx)?.afterDelete;
  if (!hook) return null;
  return runHook(() => hook(pkValues, buildHookContext(ctx, req)));
}

/** Evaluate `action.visible` against `row`. Missing predicate → visible.
 *  Thrown predicate → not visible (so a buggy condition can't crash the page). */
export function isActionVisibleFor(
  action: RowAction,
  row: Record<string, CellValue>,
): boolean {
  if (!action.visible) return true;
  try {
    return action.visible(row);
  } catch {
    return false;
  }
}

/** Run a named action and resolve it to a flash kind + message. The action's
 *  own `success` decides success vs. error; a hook that failed during the run
 *  (via `ctx.update`) downgrades a success to a warning, so the failure reaches
 *  the user without the handler having to thread it through its result. Thrown
 *  handlers and unknown action names surface as an error. */
export async function runAction(
  table: string,
  actionName: string,
  pkValues: Record<string, string>,
  ctx: TapemarkContext,
  req: TapemarkRequest,
): Promise<{ flash: "success" | "warning" | "error"; message: string }> {
  const action = ctx.tableOptions.get(table)?.actions?.[actionName];
  if (!action) {
    return { flash: "error", message: `Action "${actionName}" not found on "${table}"` };
  }
  const warnings: string[] = [];
  try {
    const result = await action.handler(
      pkValues,
      buildActionContext(ctx, req, action, table, pkValues, warnings),
    );
    if (!result.success) {
      return { flash: "error", message: result.message ?? "action failed" };
    }
    return flashForHookResult(
      result.message ?? "action completed",
      warnings.length ? warnings.join("; ") : null,
    );
  } catch (err) {
    return { flash: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Map a hook outcome to a flash kind + message — appends a warning suffix on failure. */
export function flashForHookResult(
  baseMessage: string,
  hookError: string | null,
): { flash: "success" | "warning"; message: string } {
  if (!hookError) {
    return { flash: "success", message: baseMessage };
  }
  return {
    flash: "warning",
    message: `${baseMessage} — hook failed: ${hookError}`,
  };
}
