/**
 * Standalone tapemark demo — thin wrapper around the CLI serve command.
 *
 * Usage:
 *   npx tsx examples/standalone/serve.ts [path-to-db] [--port 3333]
 *
 * This is equivalent to:
 *   npx tsx packages/cli/src/index.ts serve [path-to-db] [--port 3333]
 *
 * If no path is given, creates a demo database in memory.
 */
import { createServer, type IncomingMessage } from "node:http";
import BetterSqlite3 from "better-sqlite3";
import { createSqliteAdapter } from "../../packages/db-adapters/better-sqlite3/src/index.js";
import { createTapemark } from "../../packages/core/src/index.js";

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
      cover_image TEXT,
      author_id INTEGER REFERENCES users(id),
      published INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO posts (title, body, cover_image, author_id, published) VALUES ('Hello World', 'This is the first post.', 'https://picsum.photos/id/10/800/600', 1, 1);
    INSERT INTO posts (title, body, cover_image, author_id, published) VALUES ('Draft Post', 'Work in progress...', 'https://picsum.photos/id/22/800/600', 2, 0);
    INSERT INTO posts (title, body, cover_image, author_id, published) VALUES ('Mountain Views', 'A post about nature.', 'https://picsum.photos/id/29/800/600', 1, 1);

    CREATE TABLE movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      year INTEGER,
      poster TEXT,
      rating REAL
    );
    INSERT INTO movies (title, year, poster, rating) VALUES ('Blade Runner', 1982, 'https://picsum.photos/id/1031/400/600', 8.1);
    INSERT INTO movies (title, year, poster, rating) VALUES ('Alien', 1979, 'https://picsum.photos/id/1025/400/600', 8.5);
    INSERT INTO movies (title, year, poster, rating) VALUES ('2001: A Space Odyssey', 1968, 'https://picsum.photos/id/1062/400/600', 8.3);

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#888888'
    );
    INSERT INTO tags (name, color) VALUES ('general', '#4a90d9');
    INSERT INTO tags (name, color) VALUES ('tech', '#d94a4a');
    INSERT INTO tags (name, color) VALUES ('design', '#4ad94a');

    CREATE TABLE comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id),
      author_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO comments (post_id, author_id, body) VALUES (1, 2, 'Great post!');
    INSERT INTO comments (post_id, author_id, body) VALUES (1, 3, 'Thanks for sharing.');
    INSERT INTO comments (post_id, author_id, body) VALUES (2, 1, 'Looking forward to the final version.');

    CREATE TABLE post_tags (
      post_id INTEGER NOT NULL REFERENCES posts(id),
      tag_id INTEGER NOT NULL REFERENCES tags(id),
      PRIMARY KEY (post_id, tag_id)
    );
    INSERT INTO post_tags (post_id, tag_id) VALUES (1, 1);
    INSERT INTO post_tags (post_id, tag_id) VALUES (1, 2);
    INSERT INTO post_tags (post_id, tag_id) VALUES (2, 2);
    INSERT INTO post_tags (post_id, tag_id) VALUES (3, 3);

    CREATE VIEW published_posts AS
      SELECT posts.id, posts.title, posts.cover_image, users.name AS author
      FROM posts
      JOIN users ON users.id = posts.author_id
      WHERE posts.published = 1;
  `);
  console.log("Using in-memory demo database (6 tables, 1 view)");
  return db;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

const core = createTapemark({ db, prefix: "" });

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://localhost:${port}`);
    const path = url.pathname;
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      query[k] = v;
    });

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
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal Server Error");
  }
});

function parseFormBody(
  req: IncomingMessage,
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

server.listen(port, () => {
  if (dbPath) {
    console.log(`tapemark serving ${dbPath}`);
  }
  console.log(`http://localhost:${port}`);
});
