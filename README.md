# tapemark

A generic, self-contained database admin panel for SQLite. Browse, edit, and sync your data with a dark, monospace UI. Zero-config — point it at a `.db` file and go.

Framework-agnostic core with thin adapters for Hono, Express, Next.js, and others. Runs on Cloudflare Workers (D1), Node.js (better-sqlite3), Bun, and Deno.

## Quick start

```bash
pnpm install
npx tsx examples/standalone/serve.ts
```

Opens a demo server at **http://localhost:3333** with sample tables.

Point it at your own database:

```bash
npx tsx examples/standalone/serve.ts ~/path/to/your.db
```

Options:

```bash
npx tsx examples/standalone/serve.ts ./data.db --port 4000
```

## Embed in your app

### Hono (Cloudflare Workers / D1)

```typescript
import { createAdmin } from "tapemark-hono";

app.route("/admin", createAdmin({
  db: (c) => c.env.DB,
  prefix: "/admin",
  authorize: async (c) => checkAdmin(c),
}));
```

### Any framework

The core returns plain HTML strings — pipe them into any response:

```typescript
import { createAdminCore } from "tapemark";
import { createSqliteAdapter } from "tapemark-better-sqlite3";
import Database from "better-sqlite3";

const db = createSqliteAdapter(new Database("app.db"));
const core = createAdminCore({ db, prefix: "/admin" });

// In your request handler:
const res = await core.handle({
  method: req.method,
  path: "/users",
  params: {},
  query: {},
});
// res.status, res.headers, res.html or res.redirect

```

## Packages

| Package | Description |
|---------|-------------|
| `tapemark` | Core — router, schema introspection, CRUD, rendering, display types |
| `tapemark-hono` | Hono sub-app adapter |
| `tapemark-better-sqlite3` | better-sqlite3 → tapemark Database adapter |

## Development

```bash
pnpm install
pnpm -r test        # run all tests (117 across 3 packages)
pnpm -r build       # build all packages
```
