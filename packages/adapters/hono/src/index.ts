import { Hono } from "hono";
import {
  createTapemark,
  type Database,
  type ExecutionContextLike,
  type TapemarkBaseOptions,
  type TapemarkRequest,
} from "@jvelo/tapemark";
import type { Context } from "hono";

/** Default env shape — opaque record. Override via the type parameter. */
type DefaultEnv = Record<string, unknown>;

/**
 * Options for the Hono adapter. Extends `TapemarkBaseOptions` but replaces
 * `db` and `authorize` with Hono-aware accessors. Generic over the Hono
 * `Bindings` shape so consumers get a typed `c.env` in their callbacks.
 */
export interface HonoAdminOptions<Env = DefaultEnv>
  extends Omit<TapemarkBaseOptions, "authorize"> {
  /**
   * Database accessor. Receives the Hono context so you can extract
   * the DB from env bindings (e.g. `c.env.DB` for D1).
   */
  db: Database | ((c: Context<{ Bindings: Env }>) => Database);
  /**
   * Authorization callback. Receives the Hono context for access to
   * framework-specific auth mechanisms.
   */
  authorize?: (c: Context<{ Bindings: Env }>) => Promise<boolean>;
}

/**
 * Creates a Hono sub-app that serves the tapemark panel.
 *
 * Usage:
 * ```ts
 * import { tapemark } from "@jvelo/tapemark-hono";
 *
 * type Env = { DB: D1Database };
 *
 * app.route("/admin", tapemark<Env>({
 *   db: (c) => c.env.DB,             // c.env is typed as Env
 *   authorize: async (c) => checkAdmin(c),
 * }));
 * ```
 */
export function tapemark<Env = DefaultEnv>(
  opts: HonoAdminOptions<Env>,
): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  const prefix = opts.prefix ?? "";

  const { db, authorize, ...coreOpts } = opts;
  const core = createTapemark(coreOpts);

  app.all("*", async (c) => {
    const resolvedDb = typeof db === "function" ? db(c) : db;

    if (authorize) {
      const allowed = await authorize(c);
      if (!allowed) {
        return c.text("Forbidden", 403);
      }
    }

    const tapemarkReq = await honoToTapemarkRequest(c, prefix);
    const res = await core.handle(tapemarkReq, {
      db: resolvedDb,
      env: c.env,
      executionCtx: safeExecutionCtx(c),
    });

    if (res.redirect) {
      return c.redirect(res.redirect, res.status as 301 | 302 | 303 | 307 | 308);
    }

    return new Response(res.html ?? "", {
      status: res.status,
      headers: res.headers,
    });
  });

  return app;
}

/**
 * Return Hono's `c.executionCtx` when present. Cloudflare Workers provide
 * it; `@hono/node-server` and tests do not — Hono implements it as a
 * getter that throws when no Workers runtime is attached.
 *
 * The catch is intentionally narrow in scope (the property access only) and
 * intentionally broad in what it swallows: the goal is to recover from
 * "this runtime doesn't expose an execution context" without failing the
 * request, not to mask unrelated bugs in the adapter pipeline. If Hono ever
 * stops throwing here, this function becomes a one-line passthrough.
 */
function safeExecutionCtx(c: Context): ExecutionContextLike | undefined {
  try {
    return c.executionCtx as ExecutionContextLike;
  } catch {
    return undefined;
  }
}

/**
 * Convert a Hono request to a TapemarkRequest.
 * Strips the mount prefix from the path so the core router sees
 * paths relative to the mount point.
 */
async function honoToTapemarkRequest(
  c: Context,
  prefix: string,
): Promise<TapemarkRequest> {
  const url = new URL(c.req.url);

  // Strip the prefix from the path to get the route-relative path
  let path = c.req.path;
  if (prefix && path.startsWith(prefix)) {
    path = path.slice(prefix.length) || "/";
  }

  // Query params
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  // Body (for POST requests)
  let body: Record<string, string | string[]> | undefined;
  if (c.req.method === "POST") {
    try {
      const formData = await c.req.parseBody({ all: true });
      body = {};
      for (const [key, value] of Object.entries(formData)) {
        body[key] = value as string | string[];
      }
    } catch {
      // Not form data — ignore
    }
  }

  return {
    method: c.req.method,
    path,
    params: {},
    query,
    body,
  };
}
