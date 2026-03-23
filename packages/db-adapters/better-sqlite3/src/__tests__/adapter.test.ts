import { describe, it, expect } from "vitest";
import BetterSqlite3 from "better-sqlite3";
import { SchemaIntrospector, TableRepository } from "@jvelo/tapemark";
import { createSqliteAdapter } from "../index";

const SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT
  );
  INSERT INTO users VALUES (1, 'Alice', 'alice@example.com');
  INSERT INTO users VALUES (2, 'Bob', NULL);
`;

describe("createSqliteAdapter", () => {
  it("returns a Database-compatible object", () => {
    const raw = new BetterSqlite3(":memory:");
    const db = createSqliteAdapter(raw);
    expect(db.prepare).toBeDefined();
  });

  it("works with SchemaIntrospector end-to-end", async () => {
    const raw = new BetterSqlite3(":memory:");
    raw.exec(SCHEMA);
    const db = createSqliteAdapter(raw);

    const introspector = new SchemaIntrospector(db);
    const tables = await introspector.getTables();

    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("users");
    expect(tables[0].rowCount).toBe(2);
    expect(tables[0].primaryKey).toEqual(["id"]);
    expect(tables[0].columns).toHaveLength(3);
  });

  it("works with TableRepository CRUD", async () => {
    const raw = new BetterSqlite3(":memory:");
    raw.exec(SCHEMA);
    const db = createSqliteAdapter(raw);

    const repo = new TableRepository(db);

    // Read
    const result = await repo.getRows("users");
    expect(result.total).toBe(2);

    // Insert
    await repo.insertRow("users", { id: "3", name: "Carol", email: "carol@example.com" });
    const afterInsert = await repo.getRows("users");
    expect(afterInsert.total).toBe(3);

    // Update
    await repo.updateRow("users", { id: "1" }, { name: "Alicia" });
    const row = await repo.getRow("users", { id: "1" });
    expect(row.name).toBe("Alicia");

    // Delete
    await repo.deleteRow("users", { id: "3" });
    const afterDelete = await repo.getRows("users");
    expect(afterDelete.total).toBe(2);
  });

  it("handles parameterized queries correctly", async () => {
    const raw = new BetterSqlite3(":memory:");
    raw.exec(SCHEMA);
    const db = createSqliteAdapter(raw);

    const row = await db
      .prepare("SELECT * FROM users WHERE id = ?")
      .bind(1)
      .first<{ id: number; name: string }>();

    expect(row).not.toBeNull();
    expect(row!.name).toBe("Alice");
  });

  it("all() returns array directly (not wrapped in { results })", async () => {
    const raw = new BetterSqlite3(":memory:");
    raw.exec(SCHEMA);
    const db = createSqliteAdapter(raw);

    const rows = await db
      .prepare("SELECT * FROM users ORDER BY id")
      .all<{ id: number; name: string }>();

    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("Alice");
  });
});
