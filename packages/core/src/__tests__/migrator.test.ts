import { describe, it, expect, beforeEach } from "vitest";
import { TapemarkMigrator } from "../migrator";
import { createTestDb } from "../test-utils";
import type { Database } from "../types";
import type BetterSqlite3 from "better-sqlite3";

const SCHEMA = `
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
  CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT);
`;

describe("TapemarkMigrator", () => {
  let db: Database;
  let raw: BetterSqlite3.Database;
  let migrator: TapemarkMigrator;

  beforeEach(() => {
    ({ db, raw } = createTestDb(SCHEMA));
    migrator = new TapemarkMigrator(db);
  });

  it("creates _tapemark_meta and _tapemark_table_config on first run", async () => {
    await migrator.ensureReady();

    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const names = tables.map((t) => t.name);
    expect(names).toContain("_tapemark_meta");
    expect(names).toContain("_tapemark_table_config");
  });

  it("sets schema_version in _tapemark_meta", async () => {
    await migrator.ensureReady();

    const row = raw
      .prepare("SELECT value FROM _tapemark_meta WHERE key = 'schema_version'")
      .get() as { value: string };

    expect(parseInt(row.value, 10)).toBeGreaterThanOrEqual(1);
  });

  it("computes and stores app_schema_hash", async () => {
    await migrator.ensureReady();

    const row = raw
      .prepare("SELECT value FROM _tapemark_meta WHERE key = 'app_schema_hash'")
      .get() as { value: string };

    expect(row.value).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is idempotent (second call is a no-op)", async () => {
    await migrator.ensureReady();
    const hash1 = (
      raw
        .prepare("SELECT value FROM _tapemark_meta WHERE key = 'app_schema_hash'")
        .get() as { value: string }
    ).value;

    await migrator.ensureReady();
    const hash2 = (
      raw
        .prepare("SELECT value FROM _tapemark_meta WHERE key = 'app_schema_hash'")
        .get() as { value: string }
    ).value;

    expect(hash1).toBe(hash2);
  });

  it("re-runs after resetInitialized()", async () => {
    await migrator.ensureReady();
    migrator.resetInitialized();

    // Should not throw — just re-checks and updates
    await expect(migrator.ensureReady()).resolves.toBeUndefined();
  });
});
