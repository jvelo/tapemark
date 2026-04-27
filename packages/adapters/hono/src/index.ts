import { Hono } from "hono";
import {
  createTapemark,
  type Database,
  type BackgroundTasks,
  type TapemarkBaseOptions,
  type TapemarkRequest,
} from "@jvelo/tapemark";
import type { Context } from "hono";

/** Default env shape — opaque record. Override via the type parameter. */
type DefaultEnv = Record<string, unknown>;

/** Options for the Hono adapter. Generic over `Env` so `c.env` is typed
 *  in the `db` and `authorize` callbacks. */
export interface HonoAdminOptions<Env extends object = DefaultEnv>
  extends Omit<TapemarkBaseOptions, "authorize"> {
  /** DB accessor — gets the Hono context so you can pull from env bindings (e.g. `c.env.DB`). */
  db: Database | ((c: Context<{ Bindings: Env }>) => Database);
  /** Auth callback receiving the Hono context. */
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
export function tapemark<Env extends object = DefaultEnv>(
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

/** Returns `c.executionCtx` when present. The getter throws under Node /
 *  tests because no Workers runtime is attached; the catch is scoped to
 *  the access only — intent is "unsupported runtime", not silencing bugs. */
function safeExecutionCtx(c: Context): BackgroundTasks | undefined {
  try {
    return c.executionCtx as BackgroundTasks;
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
