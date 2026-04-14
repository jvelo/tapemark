import { Hono } from "hono";
import {
  createTapemark,
  type Database,
  type TapemarkBaseOptions,
  type TapemarkRequest,
} from "@jvelo/tapemark";
import type { Context } from "hono";

/**
 * Options for the Hono adapter. Extends TapemarkOptions but replaces
 * the `db` field with a Hono-aware accessor.
 */
export interface HonoAdminOptions
  extends Omit<TapemarkBaseOptions, "authorize"> {
  /**
   * Database accessor. Receives the Hono context so you can extract
   * the DB from env bindings (e.g. `c.env.DB` for D1).
   */
  db: Database | ((c: Context) => Database);
  /**
   * Authorization callback. Receives the Hono context for access to
   * framework-specific auth mechanisms.
   */
  authorize?: (c: Context) => Promise<boolean>;
}

/**
 * Creates a Hono sub-app that serves the tapemark panel.
 *
 * Usage:
 * ```ts
 * import { tapemark } from "@jvelo/tapemark-hono";
 *
 * app.route("/admin", tapemark({
 *   db: (c) => c.env.DB,
 *   authorize: async (c) => checkAdmin(c),
 * }));
 * ```
 */
export function tapemark(opts: HonoAdminOptions): Hono {
  const app = new Hono();
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
    const res = await core.handle(tapemarkReq, { db: resolvedDb });

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
