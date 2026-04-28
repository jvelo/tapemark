import { TapemarkError } from "./errors";
import { renderErrorPage } from "./error-page.jsx";
import { TapemarkMigrator } from "./migrator";
import { createDisplayTypeRegistry } from "./display";
import { redirect } from "./routes/response";
import { tablesRoute } from "./routes/tables";
import { rowsRoute } from "./routes/rows";
import { rowDetailRoute, rowUpdateRoute, rowDeleteRoute } from "./routes/row-detail";
import { rowCreateRoute, rowInsertRoute } from "./routes/row-create";
import { tableConfigRoute, tableConfigUpdateRoute } from "./routes/table-config";
import { bulkDeleteRoute } from "./routes/bulk-delete";
import { rowViewRoute, rowViewUpdateRoute, rowViewDeleteRoute } from "./routes/row-view";
import { rowActionRoute } from "./routes/row-action";
import { lookupRoute } from "./routes/lookup";
import { loadAsset } from "./assets/load";
import { themes, defaultTheme } from "./themes";
import type {
  Database,
  RequestOverrides,
  RouteHandler,
  TapemarkBaseOptions,
  TapemarkContext,
  TapemarkOptions,
  TapemarkRequest,
  TapemarkResponse,
} from "./types";

const FONT_CSS: Record<string, string> = {
  depart: loadAsset("fonts-depart.css"),
  plex: loadAsset("fonts-plex.css"),
  hubot: loadAsset("fonts-hubot.css"),
};
const BASE_CSS = loadAsset("tapemark.css");
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
  handle(req: TapemarkRequest, overrides?: RequestOverrides): Promise<TapemarkResponse>;
  /** Register a route. Used internally and by adapters for asset routes. */
  addRoute(method: "GET" | "POST", pattern: string, handler: RouteHandler): void;
}

export function createTapemark(options: TapemarkOptions): TapemarkCore;
export function createTapemark(options: TapemarkBaseOptions): TapemarkCore;
export function createTapemark(options: TapemarkBaseOptions & { db?: Database | (() => Database) }): TapemarkCore {
  const routes: Route[] = [];
  const prefix = options.prefix ?? "";
  const displayTypes = createDisplayTypeRegistry(options.displayTypes);
  const tableOptionsMap = new Map(
    Object.entries(options.tables ?? {}),
  );
  const scripts = options.scripts ?? [];

  let migrator: TapemarkMigrator | null = null;

  // Resolve once at setup: if `symbol` is explicitly provided (including false), use it.
  // Otherwise default to the film-reel mark only when `name` wasn't customized —
  // integrators who rebrand don't get tapemark's mark by accident.
  const resolvedSymbol: string | false =
    options.symbol !== undefined ? options.symbol : options.name === undefined ? "🎞️" : false;

  function resolveDb(): Database {
    if (!options.db) {
      throw new Error("No database configured — provide `db` in options or via per-request overrides");
    }
    return typeof options.db === "function" ? options.db() : options.db;
  }

  function getMigrator(db: Database): TapemarkMigrator {
    if (!migrator) {
      migrator = new TapemarkMigrator(db, options.readonly, options.constraints ?? "enforce");
    }
    return migrator;
  }

  function buildContext(db: Database, overrides?: RequestOverrides): TapemarkContext {
    return {
      db,
      prefix,
      displayTypes,
      tableOptions: tableOptionsMap,
      scripts,
      siteUrl: options.siteUrl,
      siteName: options.siteName ?? "site",
      name: options.name ?? "tapemark",
      symbol: resolvedSymbol,
      readonly: options.readonly ?? false,
      constraints: options.constraints ?? "enforce",
      theme: options.theme ?? defaultTheme,
      bundleFonts: options.bundleFonts !== false,
      env: overrides?.env,
      executionContext: overrides?.executionContext,
    };
  }

  async function handle(req: TapemarkRequest, overrides?: RequestOverrides): Promise<TapemarkResponse> {
    const errorCtx = {
      prefix,
      name: options.name ?? "tapemark",
      symbol: resolvedSymbol,
      siteUrl: options.siteUrl,
      siteName: options.siteName ?? "site",
      scripts: options.scripts,
    };

    if (options.authorize) {
      const result = await options.authorize(req);
      if (typeof result !== "boolean") return result;
      if (!result) return renderErrorPage(403, "Forbidden", errorCtx);
    }

    // Ensure tapemark tables exist (lazy-init migrator on first request)
    const db = overrides?.db ?? resolveDb();
    await getMigrator(db).ensureReady();

    // Match route
    const match = matchRoute(routes, req.method, req.path);
    if (!match) {
      return renderErrorPage(404, "Not Found", errorCtx);
    }

    // Inject matched params into the request
    const enrichedReq: TapemarkRequest = {
      ...req,
      params: { ...req.params, ...match.params },
    };

    const ctx = buildContext(db, overrides);

    try {
      return await match.handler(enrichedReq, ctx);
    } catch (err) {
      if (err instanceof TapemarkError) {
        return renderErrorPage(err.status, err.message, errorCtx);
      }
      // For POST mutations, redirect back with the error as a flash message
      if (req.method === "POST") {
        const msg = err instanceof Error ? err.message : "Unknown error";
        // Redirect to the GET version of the same path (strip /delete suffix)
        const redirectPath = req.path.replace(/\/delete$/, "");
        return redirect(`${prefix}${redirectPath}?flash=error&msg=${encodeURIComponent(msg)}`);
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
  const themeName = options.theme ?? defaultTheme;
  const theme = themes[themeName];
  const includeFonts = options.bundleFonts !== false;
  const fontCss = includeFonts ? (FONT_CSS[themeName] || "") : "";
  const themeVars =
    `:root {\n` +
    `  --tm-font: ${theme.fontFamily};\n` +
    `  --tm-font-mono: ${theme.fontFamilyMono};\n` +
    `  --tm-font-size-base: ${theme.fontSizeBase};\n` +
    `  --tm-bg: ${theme.bg};\n` +
    `  --tm-text: ${theme.text};\n` +
    `  --tm-border: ${theme.border};\n` +
    `  --tm-accent: ${theme.accent};\n` +
    `  --tm-accent-text: ${theme.accentText};\n` +
    `}\n`;
  const cssContent = fontCss + "\n" + BASE_CSS + "\n" + themeVars;
  addRoute("GET", "/_tapemark/styles.css", async () => ({
    status: 200,
    headers: {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
    html: cssContent,
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
  addRoute("GET", "/:table/_lookup", lookupRoute);
  addRoute("POST", "/:table/_bulk-delete", bulkDeleteRoute);
  addRoute("GET", "/:table/_row/:index", rowViewRoute);
  addRoute("POST", "/:table/_row/:index", rowViewUpdateRoute);
  addRoute("POST", "/:table/_row/:index/delete", rowViewDeleteRoute);
  addRoute("GET", "/:table/:pk", rowDetailRoute);
  addRoute("POST", "/:table/:pk", rowUpdateRoute);
  addRoute("POST", "/:table/:pk/delete", rowDeleteRoute);
  addRoute("POST", "/:table/:pk/_action/:actionName", rowActionRoute);
  addRoute("GET", "/:table", rowsRoute);

  return { handle, addRoute };
}
