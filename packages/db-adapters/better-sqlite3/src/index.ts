import type BetterSqlite3 from "better-sqlite3";
import type { Database, PreparedStatement } from "tapemark";

/**
 * Wraps a better-sqlite3 database instance to match tapemark's async
 * Database interface. better-sqlite3 is synchronous; this adapter
 * wraps each call in a resolved Promise.
 */
export function createSqliteAdapter(raw: BetterSqlite3.Database): Database {
  return {
    prepare(query: string): PreparedStatement {
      const stmt = raw.prepare(query);
      let boundValues: unknown[] = [];

      const wrapped: PreparedStatement = {
        bind(...values: unknown[]) {
          boundValues = values;
          return wrapped;
        },
        async all<T>() {
          const results = (
            boundValues.length > 0
              ? stmt.all(...boundValues)
              : stmt.all()
          ) as T[];
          return results;
        },
        async first<T>() {
          const row = (
            boundValues.length > 0
              ? stmt.get(...boundValues)
              : stmt.get()
          ) as T | undefined;
          return row ?? null;
        },
        async run() {
          if (boundValues.length > 0) {
            stmt.run(...boundValues);
          } else {
            stmt.run();
          }
        },
      };

      return wrapped;
    },
  };
}
