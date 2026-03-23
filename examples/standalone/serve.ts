/**
 * Standalone tapemark server — open a SQLite file, serve the admin UI.
 *
 * Usage:
 *   npx tsx examples/standalone/serve.ts [path-to-db] [--port 3333]
 *
 * If no path is given, creates a demo database in memory.
 */
import { createServer } from "node:http";
import BetterSqlite3 from "better-sqlite3";
import { createSqliteAdapter } from "../../packages/db-adapters/better-sqlite3/src/index.js";
import { createAdminCore } from "../../packages/core/src/index.js";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let dbPath: string | undefined;
let port = 3333;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
    i++;
  } else if (!args[i].startsWith("-")) {
    dbPath = args[i];
  }
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const raw = dbPath ? new BetterSqlite3(dbPath) : createDemoDb();
const db = createSqliteAdapter(raw);

function createDemoDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(":memory:");
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'member',
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO users (name, email, role) VALUES ('Alice', 'alice@example.com', 'admin');
    INSERT INTO users (name, email, role) VALUES ('Bob', 'bob@example.com', 'member');
    INSERT INTO users (name, email, role) VALUES ('Carol', NULL, 'member');

    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      author_id INTEGER REFERENCES users(id),
      published INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO posts (title, body, author_id, published) VALUES ('Hello World', 'This is the first post.', 1, 1);
    INSERT INTO posts (title, body, author_id, published) VALUES ('Draft Post', 'Work in progress...', 2, 0);

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#888888'
    );
    INSERT INTO tags (name, color) VALUES ('general', '#4a90d9');
    INSERT INTO tags (name, color) VALUES ('tech', '#d94a4a');
    INSERT INTO tags (name, color) VALUES ('design', '#4ad94a');
  `);
  console.log("Using in-memory demo database (3 tables: users, posts, tags)");
  return db;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

const core = createAdminCore({ db, prefix: "" });

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
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

  const tapemarkRes = await core.handle({
    method: req.method || "GET",
    path,
    params: {},
    query,
    body,
  });

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
});

function parseFormBody(
  req: import("node:http").IncomingMessage,
): Promise<Record<string, string | string[]>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
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

server.listen(port, () => {
  if (dbPath) {
    console.log(`tapemark serving ${dbPath}`);
  }
  console.log(`http://localhost:${port}`);
});
