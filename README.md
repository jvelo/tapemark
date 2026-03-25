# tapemark

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

# Show columns for a specific table
pnpm exec tsx packages/cli/src/index.ts inspect ./data.db --table users

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
import { createAdminCore } from "@jvelo/tapemark";
import { createSqliteAdapter } from "@jvelo/tapemark-better-sqlite3";
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

### Options

```typescript
tapemark({
  db: (c) => createD1Adapter(c.env.DB),
  prefix: "/admin",
  name: "admin",              // display name in the top bar
  siteUrl: "/",               // "← site" link
  siteName: "myapp",          // label for the site link
  theme: "plex",              // "plex" (default) or "depart"
  bundleFonts: true,          // false if the host app already serves the fonts
  readonly: false,            // global read-only mode
  constraints: "enforce",     // "enforce" (default) or "relaxed"
  authorize: async (c) => {}, // auth callback
});
```

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
