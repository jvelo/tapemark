# 🎞️ tapemark

A generic, self-contained database admin panel for SQLite. Browse and edit your data with a dark, monospace UI. Zero-config — point it at a `.db` file and go.

Framework-agnostic core with thin adapters. Runs on Cloudflare Workers (D1) and Node.js (better-sqlite3).

## Quick start

```bash
pnpm install
pnpm exec tsx packages/cli/src/index.ts serve ~/path/to/your.db
```

Opens an admin UI at **http://localhost:3333**.

### CLI commands

**Serve** — browse and edit a database in the browser:

```bash
# Single database
pnpm exec tsx packages/cli/src/index.ts serve ./data.db

# Multiple databases (each gets its own section)
pnpm exec tsx packages/cli/src/index.ts serve ./users.db ./content.db

# Options
pnpm exec tsx packages/cli/src/index.ts serve ./data.db --port 4000 --readonly --theme depart --constraints relaxed
```

**Inspect** — quick schema overview from the terminal:

```bash
# List tables and row counts
pnpm exec tsx packages/cli/src/index.ts inspect ./data.db

# Show columns for a specific table or view
pnpm exec tsx packages/cli/src/index.ts inspect ./data.db --show users

# Compare schemas between two databases
pnpm exec tsx packages/cli/src/index.ts inspect ./local.db --diff ./production.db
```

## Embed in your app

### Hono (Cloudflare Workers / D1)

```typescript
import { tapemark } from "@jvelo/tapemark-hono";
import { createD1Adapter } from "@jvelo/tapemark-d1";

app.route("/admin", tapemark({
  db: (c) => createD1Adapter(c.env.DB),
  prefix: "/admin",
  authorize: async (c) => checkAdmin(c),
}));
```

### Any framework

The core returns plain HTML strings — pipe them into any response:

```typescript
import { createTapemark } from "@jvelo/tapemark";
import { createSqliteAdapter } from "@jvelo/tapemark-better-sqlite3";
import Database from "better-sqlite3";

const db = createSqliteAdapter(new Database("app.db"));
const core = createTapemark({ db, prefix: "/admin" });

// In your request handler:
const res = await core.handle({
  method: req.method,
  path: "/users",
  params: {},
  query: {},
});
// res.status, res.headers, res.html or res.redirect
```

### Options

```typescript
tapemark({
  db: (c) => createD1Adapter(c.env.DB),
  prefix: "/admin",
  name: "admin",              // display name in the top bar
  siteUrl: "/",               // "← site" link
  siteName: "myapp",          // label for the site link
  theme: "hubot",             // "hubot" (default), "plex", or "depart"
  bundleFonts: true,          // false if the host app already serves the fonts
  readonly: false,            // global read-only mode
  constraints: "enforce",     // "enforce" (default) or "relaxed"
  authorize: async (c) => {}, // auth callback
  tables: {                   // per-table options
    sites: { readonly: true }, // or { hidden: true }, or hooks/actions (below)
  },
});
```

### Hooks and custom actions

Per-table **hooks** run automatically after a row is inserted, updated, or deleted through the admin UI. Handlers receive a `HookContext` with the request's DB, framework env, and a `background()` helper for fire-and-forget work.

```typescript
tapemark({
  db: (c) => createD1Adapter(c.env.DB),
  tables: {
    sites: {
      hooks: {
        afterInsert: async (row, ctx) => {
          // Slow work — defer past the response on runtimes that support it
          // (Workers, Vercel); awaited inline elsewhere.
          await ctx.background(fetchAndStoreMetadata(row, ctx));
        },
        afterUpdate: async (pk, patch, ctx) => { /* … */ },
        afterDelete: async (pk, ctx) => { /* … */ },
      },
    },
  },
});
```

Hook failures don't roll back the write — the row operation has already committed by the time the hook runs. Synchronous hook errors surface as a warning flash on the admin page; errors inside `ctx.background()` work are visible only when running inline (logged by the runtime when running via `waitUntil`).

**Custom row actions** render as extra buttons on the row detail page, separated visually from the form's `save` button. The handler receives the primary key and a `HookContext`, and returns an `ActionResult` that becomes the flash message.

```typescript
tables: {
  sites: {
    actions: {
      refetch: {
        label: "re-fetch metadata",
        handler: async (pk, ctx) => {
          await refetchSiteMetadata(pk, ctx);
          return { ok: true, message: "metadata refreshed" };
        },
      },
      mark_done: {
        label: "mark done",
        display: { list: true },                    // also expose per-row in the list
        visible: (row) => row.status !== "done",    // hide once it's already done
        handler: async (pk, ctx) => { /* … */ },
      },
    },
  },
}
```

Where each action renders is controlled by `display`: defaults are `{ detail: true, list: false }`. Set `display.list: true` to expose the button per-row in the list view (invocations from there redirect back to the list); set `display.detail: false` to hide it from the row form. Actions are gated by the same `readonly` rules as updates and deletes.

The optional `visible(row) => boolean` predicate hides the button when the action wouldn't make sense for the current row (e.g. "mark done" on a task that's already done). It's a UI hint only — handlers are still reachable by direct POST and should validate their own invariants if they need to. A predicate that throws is treated as "not visible" so a buggy condition can't break the page render.

See [`examples/hooks-and-actions`](./examples/hooks-and-actions) for a runnable walk-through — a task list whose writes feed an audit log via hooks, plus `mark done` and `duplicate` row actions.

## Packages

| Package | Description |
|---------|-------------|
| `@jvelo/tapemark` | Core — router, schema introspection, CRUD, rendering, display types |
| `@jvelo/tapemark-cli` | CLI — `serve` and `inspect` commands |
| `@jvelo/tapemark-hono` | Hono sub-app adapter |
| `@jvelo/tapemark-d1` | Cloudflare D1 database adapter |
| `@jvelo/tapemark-better-sqlite3` | better-sqlite3 database adapter |

## Development

```bash
pnpm install
pnpm run lint         # eslint
pnpm run test         # all tests
pnpm run build        # build all packages
pnpm run prerelease   # lint + test + build
pnpm run release:patch  # bump, tag, push (triggers publish on CI)
```
