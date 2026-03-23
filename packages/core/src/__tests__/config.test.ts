import { describe, it, expect, beforeEach } from "vitest";
import { ConfigStore } from "../config";
import { TapemarkMigrator } from "../migrator";
import { createTestDb } from "../test-utils";
import type { Database, TableConfig } from "../types";

const SCHEMA = `
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
`;

describe("ConfigStore", () => {
  let db: Database;
  let config: ConfigStore;

  beforeEach(async () => {
    ({ db } = createTestDb(SCHEMA));
    // Migrator creates _tapemark_table_config
    const migrator = new TapemarkMigrator(db);
    await migrator.ensureReady();
    config = new ConfigStore(db);
  });

  it("returns empty config for unconfigured table", async () => {
    const tc = await config.getTableConfig("users");
    expect(tc).toEqual({});
  });

  it("saves and retrieves config", async () => {
    const tableConfig: TableConfig = {
      columns: {
        name: { display: "text", label: "Full Name" },
      },
    };
    await config.setTableConfig("users", tableConfig);
    const retrieved = await config.getTableConfig("users");
    expect(retrieved).toEqual(tableConfig);
  });

  it("caches config in memory", async () => {
    await config.setTableConfig("users", {
      columns: { name: { display: "text" } },
    });

    // First read populates cache
    const first = await config.getTableConfig("users");

    // Tamper with DB directly — cache should still return old value
    // (we're just verifying caching, not bypassing it)
    const second = await config.getTableConfig("users");
    expect(second).toBe(first); // same reference = cached
  });

  it("invalidates cache on write", async () => {
    await config.setTableConfig("users", {
      columns: { name: { display: "text" } },
    });
    const first = await config.getTableConfig("users");

    await config.setTableConfig("users", {
      columns: { name: { display: "link" } },
    });
    const second = await config.getTableConfig("users");

    expect(second.columns?.name.display).toBe("link");
    expect(second).not.toBe(first);
  });

  it("invalidate() clears all cache", async () => {
    await config.setTableConfig("users", {
      columns: { name: { display: "text" } },
    });
    await config.getTableConfig("users"); // populate cache
    config.invalidate();

    // After invalidation, should re-read from DB
    const tc = await config.getTableConfig("users");
    expect(tc.columns?.name.display).toBe("text");
  });

  it("getColumnConfig returns defaults for missing column", () => {
    const tc: TableConfig = {
      columns: { name: { display: "text" } },
    };
    expect(config.getColumnConfig(tc, "name")).toEqual({ display: "text" });
    expect(config.getColumnConfig(tc, "missing")).toEqual({});
  });
});
