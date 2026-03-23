/**
 * Test-only adapter: wraps better-sqlite3 to match the Database interface.
 * Not shipped in the published package.
 */
import BetterSqlite3 from "better-sqlite3";
import type { Database, PreparedStatement } from "./types";

export function createTestDb(
  schema?: string,
): { db: Database; raw: BetterSqlite3.Database } {
  const raw = new BetterSqlite3(":memory:");
  if (schema) {
    raw.exec(schema);
  }
  return { db: wrapSqlite(raw), raw };
}

export function wrapSqlite(raw: BetterSqlite3.Database): Database {
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
