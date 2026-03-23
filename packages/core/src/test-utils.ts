/**
 * Test helpers — wraps better-sqlite3 via the real adapter.
 * Not shipped in the published package.
 */
import BetterSqlite3 from "better-sqlite3";
import { createSqliteAdapter } from "@jvelo/tapemark-better-sqlite3";
import type { Database } from "./types";

export function createTestDb(
  schema?: string,
): { db: Database; raw: BetterSqlite3.Database } {
  const raw = new BetterSqlite3(":memory:");
  if (schema) {
    raw.exec(schema);
  }
  return { db: createSqliteAdapter(raw), raw };
}
