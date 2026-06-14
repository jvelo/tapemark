# @jvelo/tapemark-d1

[Cloudflare D1](https://developers.cloudflare.com/d1/) database adapter for [Tapemark](https://github.com/jvelo/tapemark).

```typescript
import { createD1Adapter } from "@jvelo/tapemark-d1";

const db = createD1Adapter(c.env.DB);
```

Typically used with [`@jvelo/tapemark-hono`](https://www.npmjs.com/package/@jvelo/tapemark-hono).

> **Foreign keys:** D1 enforces foreign keys unconditionally and ignores `PRAGMA foreign_keys`, so `constraints: "relaxed"` has no effect on D1 — it only relaxes native SQLite.

## License

[MPL-2.0](./LICENSE)
