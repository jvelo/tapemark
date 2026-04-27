import type {
  CellValue,
  HookContext,
  RowAction,
  TableHooks,
  TapemarkContext,
  TapemarkRequest,
} from "./types";

/** Build a HookContext from the current request — shared by hooks and actions. */
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

/** Run a named action. Returns `{ ok, message }`; thrown handlers and
 *  unknown action names both surface as `{ ok: false }`. */
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
