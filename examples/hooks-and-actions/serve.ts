/**
 * Tapemark demo — lifecycle hooks and custom row actions.
 *
 * Usage:
 *   pnpm --filter @jvelo/tapemark-example-hooks-and-actions dev
 *   # or: pnpm tsx examples/hooks-and-actions/serve.ts
 *
 * Open http://localhost:3334 and:
 *   • Create/edit/delete rows in `tasks` → watch `task_events` fill up automatically (hooks).
 *   • Open a task and click the "mark done" or "duplicate" buttons (custom actions).
 */
import { createServer, type IncomingMessage } from "node:http";
import BetterSqlite3 from "better-sqlite3";
import { createSqliteAdapter } from "../../packages/db-adapters/better-sqlite3/src/index.js";
import { createTapemark, type HookContext } from "../../packages/core/src/index.js";

const PORT = 3334;

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const raw = new BetterSqlite3(":memory:");
raw.exec(`
  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  INSERT INTO tasks (title, status) VALUES ('Write the README', 'todo');
  INSERT INTO tasks (title, status, notes) VALUES ('Ship the release', 'in_progress', 'Blocked on review');

  CREATE TABLE task_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id),
    event TEXT NOT NULL,
    detail TEXT,
    at TEXT DEFAULT (datetime('now'))
  );
`);
const db = createSqliteAdapter(raw);

// ---------------------------------------------------------------------------
// Hooks — write an entry to task_events whenever a task row changes.
// ---------------------------------------------------------------------------

async function logEvent(
  ctx: HookContext,
  taskId: string | number | null,
  event: string,
  detail: string | null,
): Promise<void> {
  await ctx.db
    .prepare("INSERT INTO task_events (task_id, event, detail) VALUES (?, ?, ?)")
    .bind(taskId, event, detail)
    .run();
}

// ---------------------------------------------------------------------------
// Tapemark core — hooks and actions declared in `tables`.
// ---------------------------------------------------------------------------

const core = createTapemark({
  db,
  prefix: "",
  name: "hooks & actions demo",
  tables: {
    tasks: {
      hooks: {
        // Fires after a new task is inserted. `row` has the full row including
        // auto-generated `id` and `created_at`.
        afterInsert: async (row, ctx) => {
          await logEvent(ctx, row.id as number, "created", `title="${row.title as string}"`);
        },
        // Fires after a task is updated. `patch` is the submitted form data.
        afterUpdate: async (pk, patch, ctx) => {
          const fields = Object.keys(patch).join(", ");
          await logEvent(ctx, Number(pk.id), "updated", `fields: ${fields}`);
        },
        // Fires after a task is deleted.
        afterDelete: async (pk, ctx) => {
          await logEvent(ctx, Number(pk.id), "deleted", null);
        },
      },
      actions: {
        // User-triggered: mark a task as done. Exposed in the list view too
        // since it's a high-frequency operation. Hidden once already done —
        // there's nothing meaningful to do on a row that's already in the
        // target state.
        mark_done: {
          label: "mark done",
          display: { list: true },
          visible: (row) => row.status !== "done",
          handler: async (pk, ctx) => {
            await ctx.db
              .prepare("UPDATE tasks SET status = 'done' WHERE id = ?")
              .bind(pk.id)
              .run();
            await logEvent(ctx, Number(pk.id), "marked_done", null);
            return { ok: true, message: `task ${pk.id} marked done` };
          },
        },
        // User-triggered: clone a task into a new row.
        duplicate: {
          label: "duplicate",
          handler: async (pk, ctx) => {
            await ctx.db
              .prepare(
                `INSERT INTO tasks (title, status, notes)
                 SELECT title || ' (copy)', 'todo', notes FROM tasks WHERE id = ?`,
              )
              .bind(pk.id)
              .run();
            const row = await ctx.db
              .prepare("SELECT last_insert_rowid() as id")
              .first<{ id: number }>();
            await logEvent(ctx, Number(pk.id), "duplicated", `new id=${row?.id}`);
            return { ok: true, message: `duplicated as task ${row?.id}` };
          },
        },
      },
    },
  },
});

// ---------------------------------------------------------------------------
// HTTP server — minimal, same shape as the standalone example.
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      query[k] = v;
    });

    let body: Record<string, string | string[]> | undefined;
    if (req.method === "POST") {
      body = await parseFormBody(req);
    }

    const r = await core.handle({
      method: req.method || "GET",
      path: url.pathname,
      params: {},
      query,
      body,
    });

    if (r.redirect) {
      res.writeHead(r.status, { location: r.redirect, ...r.headers });
      res.end();
      return;
    }
    res.writeHead(r.status, r.headers);
    res.end(r.html ?? "");
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal Server Error");
  }
});

function parseFormBody(req: IncomingMessage): Promise<Record<string, string | string[]>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: string) => (data += chunk));
    req.on("end", () => {
      const result: Record<string, string | string[]> = {};
      for (const [key, value] of new URLSearchParams(data)) {
        const existing = result[key];
        if (existing) {
          result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
        } else {
          result[key] = value;
        }
      }
      resolve(result);
    });
  });
}

server.listen(PORT, () => {
  console.log(`hooks-and-actions demo: http://localhost:${PORT}`);
  console.log("  → /tasks        edit rows, hooks populate task_events");
  console.log("  → /task_events  audit log");
});
