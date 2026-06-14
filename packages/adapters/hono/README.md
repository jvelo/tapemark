# @jvelo/tapemark-hono

[Hono](https://hono.dev) adapter for [Tapemark](https://github.com/jvelo/tapemark) — mount the SQLite admin UI as a sub-app (Cloudflare Workers, Node, Bun).

```typescript
import { tapemark } from "@jvelo/tapemark-hono";
import { createD1Adapter } from "@jvelo/tapemark-d1";

app.route("/admin", tapemark({
  db: (c) => createD1Adapter(c.env.DB),
  prefix: "/admin",
  authorize: async (c) => checkAdmin(c),
}));
```

See the [main README](https://github.com/jvelo/tapemark#readme) for options, hooks, actions, and auth.

## License

[MPL-2.0](./LICENSE)
