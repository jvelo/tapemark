import type {
  CellValue,
  HookContext,
  RowAction,
  TableHooks,
  TapemarkContext,
  TapemarkRequest,
} from "./types";

/**
 * Build a hook context from the current Tapemark context + request.
 * Shared by both lifecycle hooks and custom row actions.
 */
function buildHookContext(
  ctx: TapemarkContext,
  req: TapemarkRequest,
): HookContext {
  return {
    db: ctx.db,
    env: ctx.env,
    executionCtx: ctx.executionCtx,
    request: req,
  };
}

function getHooks(table: string, ctx: TapemarkContext): TableHooks | undefined {
  return ctx.tableOptions.get(table)?.hooks;
}

/**
 * Run a hook and return an error message if it threw, or `null` on success
 * (including when no hook is registered). Hook failures never throw — they
 * surface as a warning flash since the row operation itself has already
 * committed.
 */
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
  patch: Record<string, string>,
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

/**
 * Evaluate an action's `visible` predicate against a row. A predicate that
 * throws is treated as "not visible" so a buggy condition can't take down
 * the whole list. Actions without a predicate are always visible.
 */
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

/**
 * Run a named action. Returns the ActionResult, or `{ ok: false, message }`
 * if the action threw or doesn't exist. The caller turns this into a flash.
 */
export async function runAction(
  table: string,
  actionName: string,
  pkValues: Record<string, string>,
  ctx: TapemarkContext,
  req: TapemarkRequest,
): Promise<{ ok: boolean; message?: string }> {
  const action = ctx.tableOptions.get(table)?.actions?.[actionName];
  if (!action) {
    return { ok: false, message: `Action "${actionName}" not found on "${table}"` };
  }
  try {
    return await action.handler(pkValues, buildHookContext(ctx, req));
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Build a flash message fragment that appends a hook-warning suffix when a
 * hook failed. Returns "success" or "warning" flash kind.
 */
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
