# @jvelo/tapemark-better-sqlite3

[better-sqlite3](https://github.com/WiseLibs/better-sqlite3) database adapter for [Tapemark](https://github.com/jvelo/tapemark) on Node.js.

```typescript
import { createSqliteAdapter } from "@jvelo/tapemark-better-sqlite3";
import Database from "better-sqlite3";

const db = createSqliteAdapter(new Database("app.db"));
```

`better-sqlite3` is a peer dependency — install it alongside this package.

See the [main README](https://github.com/jvelo/tapemark#readme) for usage.

## License

[MPL-2.0](./LICENSE)
