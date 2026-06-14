# @jvelo/tapemark

Framework-agnostic core for [Tapemark](https://github.com/jvelo/tapemark) — a self-contained admin UI for SQLite. Router, schema introspection, CRUD, and server-rendered (Preact) HTML.

Most users want an adapter instead:

- **CLI** — [`@jvelo/tapemark-cli`](https://www.npmjs.com/package/@jvelo/tapemark-cli)
- **Hono / Cloudflare Workers** — [`@jvelo/tapemark-hono`](https://www.npmjs.com/package/@jvelo/tapemark-hono) + [`@jvelo/tapemark-d1`](https://www.npmjs.com/package/@jvelo/tapemark-d1)
- **Node.js** — [`@jvelo/tapemark-better-sqlite3`](https://www.npmjs.com/package/@jvelo/tapemark-better-sqlite3)

## Use directly

The core returns plain HTML strings — pipe them into any response:

```typescript
import { createTapemark } from "@jvelo/tapemark";
import { createSqliteAdapter } from "@jvelo/tapemark-better-sqlite3";
import Database from "better-sqlite3";

const core = createTapemark({
  db: createSqliteAdapter(new Database("app.db")),
  prefix: "/admin",
});

const res = await core.handle({ method: "GET", path: "/users", params: {}, query: {} });
// res.status, res.headers, res.html | res.redirect
```

See the [main README](https://github.com/jvelo/tapemark#readme) for options, hooks, actions, and themes.

## License

[MPL-2.0](./LICENSE)
