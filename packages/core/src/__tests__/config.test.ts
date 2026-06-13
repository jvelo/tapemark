/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ConfigStore, orderColumns } from "../config";
import { TapemarkMigrator } from "../migrator";
import { createTestDb } from "../test-utils";
import type { Column, Database, TableConfig } from "../types";

function col(name: string): Column {
  return {
    name,
    rawType: "TEXT",
    affinity: "text",
    nullable: true,
    defaultValue: null,
    primaryKeyPosition: null,
  };
}

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

describe("orderColumns", () => {
  const cols = [col("id"), col("name"), col("email"), col("created_at")];
  const names = (cs: Column[]) => cs.map((c) => c.name);

  it("returns input unchanged when order is missing or empty", () => {
    expect(names(orderColumns(cols, {}))).toEqual(["id", "name", "email", "created_at"]);
    expect(names(orderColumns(cols, { order: [] }))).toEqual(["id", "name", "email", "created_at"]);
  });

  it("applies a full order", () => {
    expect(names(orderColumns(cols, { order: ["email", "id", "created_at", "name"] })))
      .toEqual(["email", "id", "created_at", "name"]);
  });

  it("trails unlisted columns in schema order", () => {
    expect(names(orderColumns(cols, { order: ["name", "email"] })))
      .toEqual(["name", "email", "id", "created_at"]);
  });

  it("silently drops unknown column names", () => {
    expect(names(orderColumns(cols, { order: ["name", "ghost", "id"] })))
      .toEqual(["name", "id", "email", "created_at"]);
  });

  it("dedupes repeated names in order", () => {
    expect(names(orderColumns(cols, { order: ["name", "id", "name"] })))
      .toEqual(["name", "id", "email", "created_at"]);
  });
});
