import { createServer } from "node:http";
import { resolve, basename } from "node:path";
import { existsSync } from "node:fs";
import { globSync } from "node:fs";
import { defineCommand } from "citty";
import BetterSqlite3 from "better-sqlite3";
import { createSqliteAdapter } from "tapemark-better-sqlite3";
import { createAdminCore } from "tapemark";
import type { TapemarkCore, TapemarkRequest } from "tapemark";

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
    _: {
      type: "positional",
      description: "SQLite file paths (supports globs)",
      required: false,
    },
  },
  async run({ args, rawArgs }) {
    const port = parseInt(args.port, 10);
    const readonly = args.readonly;
    // citty positional args: extract file paths from rawArgs (skip flags)
    const rawPaths = (rawArgs ?? []).filter(
      (a) => !a.startsWith("-") && a !== String(args.port),
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
      const core = createAdminCore({
        db,
        prefix,
        name: filePaths.length > 1 ? name : "tapemark",
        readonly,
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
            // Landing page: list databases
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            res.end(renderDbList(databases, port));
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

function sendResponse(
  res: import("node:http").ServerResponse,
  tapemarkRes: { status: number; headers: Record<string, string>; html?: string; redirect?: string },
): void {
  if (tapemarkRes.redirect) {
    res.writeHead(tapemarkRes.status, {
      location: tapemarkRes.redirect,
      ...tapemarkRes.headers,
    });
    res.end();
    return;
  }
  res.writeHead(tapemarkRes.status, tapemarkRes.headers);
  res.end(tapemarkRes.html ?? "");
}

function parseFormBody(
  req: import("node:http").IncomingMessage,
): Promise<Record<string, string | string[]>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: string) => (data += chunk));
    req.on("end", () => {
      const result: Record<string, string | string[]> = {};
      const params = new URLSearchParams(data);
      for (const [key, value] of params) {
        const existing = result[key];
        if (existing) {
          result[key] = Array.isArray(existing)
            ? [...existing, value]
            : [existing, value];
        } else {
          result[key] = value;
        }
      }
      resolve(result);
    });
  });
}

function renderDbList(databases: DbEntry[], port: number): string {
  const rows = databases
    .map(
      (db) =>
        `<tr><td><a href="/${db.name}">${db.name}</a></td><td class="tm-muted">${db.path}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>tapemark</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'IBM Plex Mono', monospace; font-size: 0.81rem; background: #181818; color: #fff; min-height: 100vh; }
    .tm-landing { padding: 2rem; max-width: 800px; }
    .tm-landing h1 { font-size: 1.2rem; margin: 0 0 1.5rem 0; letter-spacing: -0.5px; }
    .tm-landing table { width: 100%; border-collapse: collapse; }
    .tm-landing th { text-align: left; padding: 0.27rem 0.45rem; border-bottom: 1px solid #f3f3f3; font-weight: normal; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.72rem; }
    .tm-landing td { padding: 0.27rem 0.45rem; border-bottom: 1px solid #333; }
    .tm-landing a { color: #fff; text-decoration: none; }
    .tm-landing a:hover { color: #FFD043; }
    .tm-muted { opacity: 0.4; font-size: 0.72rem; }
  </style>
</head>
<body>
  <div class="tm-landing">
    <h1>tapemark</h1>
    <table>
      <thead><tr><th>database</th><th>path</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</body>
</html>`;
}
