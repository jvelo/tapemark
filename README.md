# tapemark

A generic, self-contained database admin panel for SQLite. Browse, edit, and sync your data with a dark, monospace UI. Zero-config — point it at a `.db` file and go.

Framework-agnostic core with thin adapters for Hono, Express, Next.js, and others. Runs on Cloudflare Workers (D1), Node.js (better-sqlite3), Bun, and Deno.

## Quick start

```bash
pnpm install
npx tsx packages/cli/src/index.ts serve ~/path/to/your.db
```

Opens an admin UI at **http://localhost:3333**.

### CLI commands

**Serve** — browse and edit a database in the browser:

```bash
# Single database
npx tsx packages/cli/src/index.ts serve ./data.db

# Multiple databases (each gets its own section)
npx tsx packages/cli/src/index.ts serve ./users.db ./content.db

# Custom port, read-only mode
npx tsx packages/cli/src/index.ts serve ./data.db --port 4000 --readonly
```

**Inspect** — quick schema overview from the terminal:

```bash
# List tables and row counts
npx tsx packages/cli/src/index.ts inspect ./data.db

# Show columns for a specific table
npx tsx packages/cli/src/index.ts inspect ./data.db --table users

# Compare schemas between two databases
npx tsx packages/cli/src/index.ts inspect ./local.db --diff ./production.db
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
| `tapemark-cli` | CLI — `serve` and `inspect` commands |
| `tapemark-hono` | Hono sub-app adapter |
| `tapemark-better-sqlite3` | better-sqlite3 → tapemark Database adapter |

## Development

```bash
pnpm install
pnpm -r test        # run all tests (122 across 4 packages)
pnpm -r build       # build all packages
```
