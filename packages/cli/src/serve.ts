import { createServer } from "node:http";
import { resolve, basename } from "node:path";
import { existsSync, globSync  } from "node:fs";
import { defineCommand } from "citty";
import BetterSqlite3 from "better-sqlite3";
import { createSqliteAdapter } from "@jvelo/tapemark-better-sqlite3";
import { createTapemark, renderDatabaseListPage } from "@jvelo/tapemark";
import { parseFormBody, sendResponse } from "./http";
import type { ConstraintMode, TapemarkCore, ThemeName } from "@jvelo/tapemark";

interface DbEntry {
  name: string;
  path: string;
  core: TapemarkCore;
}

export const serveCommand = defineCommand({
  meta: {
    name: "serve",
    description: "Open SQLite files and serve the admin UI",
  },
  args: {
    port: {
      type: "string",
      description: "Port to listen on",
      default: "3333",
    },
    readonly: {
      type: "boolean",
      description: "Read-only mode (no writes, no deletes)",
      default: false,
    },
    theme: {
      type: "string",
      description: "Theme (hubot, plex, or depart)",
      default: "hubot",
    },
    constraints: {
      type: "string",
      description: "Constraint mode (enforce or relaxed)",
      default: "enforce",
    },
    _: {
      type: "positional",
      description: "SQLite file paths (supports globs)",
      required: false,
    },
  },
  async run({ args, rawArgs }) {
    const port = parseInt(args.port, 10);
    const readonly = args.readonly;
    const theme: ThemeName =
      args.theme === "depart" ? "depart" : args.theme === "plex" ? "plex" : "hubot";
    const constraints: ConstraintMode = args.constraints === "relaxed" ? "relaxed" : "enforce";
    // citty positional args: extract file paths from rawArgs (skip flags)
    const rawPaths = (rawArgs ?? []).filter(
      (a) => !a.startsWith("-") && a !== String(args.port) && a !== args.theme && a !== args.constraints,
    );

    // Resolve file paths (expand globs)
    const filePaths = resolveFilePaths(rawPaths);

    if (filePaths.length === 0) {
      console.log("No database files specified. Use: tapemark serve <file.db> [file2.db ...]");
      process.exit(1);
    }

    // Open databases
    const databases: DbEntry[] = filePaths.map((filePath) => {
      const absPath = resolve(filePath);
      if (!existsSync(absPath)) {
        console.error(`File not found: ${absPath}`);
        process.exit(1);
      }

      const name = basename(absPath, ".db")
        .replace(/\.sqlite3?$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_");

      const raw = new BetterSqlite3(absPath, {
        readonly: readonly,
      });
      const db = createSqliteAdapter(raw);

      const prefix = filePaths.length > 1 ? `/${name}` : "";
      const core = createTapemark({
        db,
        prefix,
        // Passing name explicitly would suppress the default symbol
        // (the "rebranded" heuristic), so re-assert it in multi-DB mode.
        ...(filePaths.length > 1 ? { name, symbol: "🎞️" as const } : {}),
        readonly,
        theme,
        constraints,
      });

      return { name, path: absPath, core };
    });

    const isMultiDb = databases.length > 1;

    // HTTP server
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", `http://localhost:${port}`);
        const path = url.pathname;
        const query: Record<string, string> = {};
        url.searchParams.forEach((v, k) => {
          query[k] = v;
        });

        // Parse body for POST
        let body: Record<string, string | string[]> | undefined;
        if (req.method === "POST") {
          body = await parseFormBody(req);
        }

        if (isMultiDb) {
          // Multi-DB: route by first path segment
          if (path === "/") {
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            res.end(
              renderDatabaseListPage(
                databases.map((db) => ({ name: db.name, path: db.path })),
              ),
            );
            return;
          }

          // All cores serve identical assets, so any one works.
          if (path.startsWith("/_tapemark/")) {
            const tapemarkRes = await databases[0].core.handle({
              method: req.method || "GET",
              path,
              params: {},
              query,
              body,
            });
            sendResponse(res, tapemarkRes);
            return;
          }

          const dbEntry = databases.find((db) =>
            path === `/${db.name}` || path.startsWith(`/${db.name}/`),
          );

          if (!dbEntry) {
            res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
            res.end("<h1>Not Found</h1>");
            return;
          }

          // Strip the DB prefix from path for the core router
          const corePath =
            path.slice(`/${dbEntry.name}`.length) || "/";

          const tapemarkRes = await dbEntry.core.handle({
            method: req.method || "GET",
            path: corePath,
            params: {},
            query,
            body,
          });

          sendResponse(res, tapemarkRes);
        } else {
          // Single DB
          const tapemarkRes = await databases[0].core.handle({
            method: req.method || "GET",
            path,
            params: {},
            query,
            body,
          });

          sendResponse(res, tapemarkRes);
        }
      } catch (err) {
        console.error(err);
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("Internal Server Error");
      }
    });

    server.listen(port, () => {
      if (isMultiDb) {
        console.log(`tapemark serving ${databases.length} databases:`);
        for (const db of databases) {
          console.log(`  ${db.name} → ${db.path}`);
        }
      } else {
        console.log(`tapemark serving ${databases[0].path}`);
      }
      console.log(`http://localhost:${port}`);
    });
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveFilePaths(rawPaths: string[]): string[] {
  const result: string[] = [];
  for (const p of rawPaths) {
    if (p.includes("*")) {
      // Glob expansion
      try {
        const matches = globSync(p);
        result.push(...matches.filter((m) => m.endsWith(".db") || m.endsWith(".sqlite") || m.endsWith(".sqlite3")));
      } catch {
        result.push(p);
      }
    } else {
      result.push(p);
    }
  }
  return result;
}


