import { TapemarkError } from "./errors";
import { TapemarkMigrator } from "./migrator";
import { createDisplayTypeRegistry } from "./display";
import { tablesRoute } from "./routes/tables";
import { rowsRoute } from "./routes/rows";
import { rowDetailRoute, rowUpdateRoute, rowDeleteRoute } from "./routes/row-detail";
import { rowCreateRoute, rowInsertRoute } from "./routes/row-create";
import { tableConfigRoute, tableConfigUpdateRoute } from "./routes/table-config";
import { bulkDeleteRoute } from "./routes/bulk-delete";
import { loadAsset } from "./assets/load";
import type {
  Database,
  RouteHandler,
  TapemarkContext,
  TapemarkOptions,
  TapemarkRequest,
  TapemarkResponse,
} from "./types";

const CSS_CONTENT = loadAsset("tapemark.css");
const JS_CONTENT = loadAsset("tapemark.js");

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

interface Route {
  method: "GET" | "POST";
  /**
   * Pattern with named params: "/", "/:table", "/:table/:pk", etc.
   * Supports a single level of named segments.
   */
  pattern: string;
  handler: RouteHandler;
}

interface RouteMatch {
  handler: RouteHandler;
  params: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

function matchRoute(
  routes: Route[],
  method: string,
  path: string,
): RouteMatch | null {
  // Normalize: strip trailing slash (except root)
  const normalizedPath = path === "/" ? "/" : path.replace(/\/$/, "");

  for (const route of routes) {
    if (route.method !== method) continue;

    const patternParts = route.pattern.split("/");
    const pathParts = normalizedPath.split("/");

    if (patternParts.length !== pathParts.length) continue;

    const params: Record<string, string> = {};
    let match = true;

    for (let i = 0; i < patternParts.length; i++) {
      const pat = patternParts[i];
      const val = pathParts[i];

      if (pat.startsWith(":")) {
        params[pat.slice(1)] = decodeURIComponent(val);
      } else if (pat !== val) {
        match = false;
        break;
      }
    }

    if (match) {
      return { handler: route.handler, params };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export interface TapemarkCore {
  /** Handle an incoming request. */
  handle(req: TapemarkRequest): Promise<TapemarkResponse>;
  /** Register a route. Used internally and by adapters for asset routes. */
  addRoute(method: "GET" | "POST", pattern: string, handler: RouteHandler): void;
}

export function createAdminCore(options: TapemarkOptions): TapemarkCore {
  const routes: Route[] = [];
  const prefix = options.prefix ?? "";
  const displayTypes = createDisplayTypeRegistry(options.displayTypes);
  const tableOptionsMap = new Map(
    Object.entries(options.tables ?? {}),
  );
  const scripts = options.scripts ?? [];

  let migrator: TapemarkMigrator | null = null;

  function resolveDb(db: Database | (() => Database)): Database {
    return typeof db === "function" ? db() : db;
  }

  function getMigrator(db: Database): TapemarkMigrator {
    if (!migrator) {
      migrator = new TapemarkMigrator(db);
    }
    return migrator;
  }

  function buildContext(): TapemarkContext {
    return {
      db: resolveDb(options.db),
      prefix,
      displayTypes,
      tableOptions: tableOptionsMap,
      scripts,
      siteUrl: options.siteUrl,
      name: options.name ?? "tapemark",
      readonly: options.readonly ?? false,
    };
  }

  async function handle(req: TapemarkRequest): Promise<TapemarkResponse> {
    // Auth check
    if (options.authorize) {
      const allowed = await options.authorize(req);
      if (!allowed) {
        return {
          status: 403,
          headers: { "content-type": "text/html; charset=utf-8" },
          html: "<h1>Forbidden</h1>",
        };
      }
    }

    // Ensure tapemark tables exist (lazy-init migrator on first request)
    const db = resolveDb(options.db);
    await getMigrator(db).ensureReady();

    // Match route
    const match = matchRoute(routes, req.method, req.path);
    if (!match) {
      return {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" },
        html: "<h1>Not Found</h1>",
      };
    }

    // Inject matched params into the request
    const enrichedReq: TapemarkRequest = {
      ...req,
      params: { ...req.params, ...match.params },
    };

    const ctx = buildContext();

    try {
      return await match.handler(enrichedReq, ctx);
    } catch (err) {
      if (err instanceof TapemarkError) {
        return {
          status: err.status,
          headers: { "content-type": "text/html; charset=utf-8" },
          html: `<h1>${err.message}</h1>`,
        };
      }
      throw err;
    }
  }

  function addRoute(
    method: "GET" | "POST",
    pattern: string,
    handler: RouteHandler,
  ): void {
    routes.push({ method, pattern, handler });
  }

  // Asset routes (served before auth — CSS/JS are not sensitive)
  addRoute("GET", "/_tapemark/styles.css", async () => ({
    status: 200,
    headers: {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
    html: CSS_CONTENT,
  }));
  addRoute("GET", "/_tapemark/admin.js", async () => ({
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
    html: JS_CONTENT,
  }));

  // Register built-in routes
  // Order matters: more specific patterns must come before general ones
  addRoute("GET", "/", tablesRoute);
  addRoute("GET", "/:table/new", rowCreateRoute);
  addRoute("POST", "/:table/new", rowInsertRoute);
  addRoute("GET", "/:table/_config", tableConfigRoute);
  addRoute("POST", "/:table/_config", tableConfigUpdateRoute);
  addRoute("POST", "/:table/_bulk-delete", bulkDeleteRoute);
  addRoute("GET", "/:table/:pk", rowDetailRoute);
  addRoute("POST", "/:table/:pk", rowUpdateRoute);
  addRoute("POST", "/:table/:pk/delete", rowDeleteRoute);
  addRoute("GET", "/:table", rowsRoute);

  return { handle, addRoute };
}
