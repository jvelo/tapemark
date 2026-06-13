/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TableRepository, encodePk, decodePk, castValue } from "../repository";
import { NotFoundError, ValidationError } from "../errors";
import { createTestDb } from "../test-utils";
import type { Column, Database } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    score REAL DEFAULT 0.0
  );
  INSERT INTO users VALUES (1, 'Alice', 'alice@example.com', 9.5);
  INSERT INTO users VALUES (2, 'Bob', NULL, 3.0);
  INSERT INTO users VALUES (3, 'Carol', 'carol@example.com', 7.2);
`;

const COMPOSITE_SCHEMA = `
  CREATE TABLE memberships (
    user_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    role TEXT DEFAULT 'member',
    PRIMARY KEY (user_id, group_id)
  );
  INSERT INTO memberships VALUES (1, 10, 'admin');
  INSERT INTO memberships VALUES (1, 20, 'member');
  INSERT INTO memberships VALUES (2, 10, 'member');
`;

// ---------------------------------------------------------------------------
// PK encoding
// ---------------------------------------------------------------------------

describe("encodePk / decodePk", () => {
  it("encodes a single-column PK", () => {
    const encoded = encodePk(["id"], { id: 42 });
    expect(encoded).toBe("42");
    const decoded = decodePk(["id"], encoded);
    expect(decoded).toEqual({ id: "42" });
  });

  it("encodes a composite PK", () => {
    const encoded = encodePk(["user_id", "group_id"], {
      user_id: 1,
      group_id: 10,
    });
    expect(encoded).toBe("1,10");
    const decoded = decodePk(["user_id", "group_id"], encoded);
    expect(decoded).toEqual({ user_id: "1", group_id: "10" });
  });

  it("handles special characters in values", () => {
    const encoded = encodePk(["name"], { name: "hello,world" });
    expect(encoded).toBe("hello%2Cworld");
    const decoded = decodePk(["name"], encoded);
    expect(decoded).toEqual({ name: "hello,world" });
  });
});

// ---------------------------------------------------------------------------
// castValue
// ---------------------------------------------------------------------------

describe("castValue", () => {
  const textCol: Column = {
    name: "name",
    rawType: "TEXT",
    affinity: "text",
    nullable: true,
    defaultValue: null,
    primaryKeyPosition: null,
  };

  const intCol: Column = {
    name: "age",
    rawType: "INTEGER",
    affinity: "integer",
    nullable: true,
    defaultValue: null,
    primaryKeyPosition: null,
  };

  const realCol: Column = {
    name: "score",
    rawType: "REAL",
    affinity: "real",
    nullable: false,
    defaultValue: "0.0",
    primaryKeyPosition: null,
  };

  it("returns string for text columns", () => {
    expect(castValue("hello", textCol)).toBe("hello");
  });

  it("returns null for empty string on nullable column", () => {
    expect(castValue("", textCol)).toBeNull();
  });

  it("returns empty string for empty non-nullable text column", () => {
    const nonNullableText = { ...textCol, nullable: false };
    expect(castValue("", nonNullableText)).toBe("");
  });

  it("casts to number for integer columns", () => {
    expect(castValue("42", intCol)).toBe(42);
  });

  it("casts to number for real columns", () => {
    expect(castValue("3.14", realCol)).toBe(3.14);
  });

  it("returns original string for non-numeric input on integer column", () => {
    expect(castValue("not-a-number", intCol)).toBe("not-a-number");
  });
});

// ---------------------------------------------------------------------------
// TableRepository
// ---------------------------------------------------------------------------

describe("TableRepository", () => {
  let db: Database;
  let repo: TableRepository;

  describe("simple PK", () => {
    beforeEach(() => {
      ({ db } = createTestDb(SCHEMA));
      repo = new TableRepository(db);
    });

    it("getRows returns paginated results", async () => {
      const result = await repo.getRows("users", 1, 2);
      expect(result.total).toBe(3);
      expect(result.rows).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(2);
      expect(result.columns).toHaveLength(4);
    });

    it("getRows page 2", async () => {
      const result = await repo.getRows("users", 2, 2);
      expect(result.rows).toHaveLength(1);
      expect((result.rows[0] as Record<string, unknown>).name).toBe("Carol");
    });

    it("getRow returns a single row", async () => {
      const row = await repo.getRow("users", { id: "1" });
      expect(row.name).toBe("Alice");
      expect(row.email).toBe("alice@example.com");
    });

    it("getRow throws NotFoundError for missing row", async () => {
      await expect(repo.getRow("users", { id: "999" })).rejects.toThrow(
        NotFoundError,
      );
    });

    it("insertRow creates a new row", async () => {
      await repo.insertRow("users", {
        id: "4",
        name: "Dave",
        email: "dave@example.com",
        score: "5.0",
      });
      const row = await repo.getRow("users", { id: "4" });
      expect(row.name).toBe("Dave");
      expect(row.score).toBe(5.0);
    });

    it("insertRow casts numeric values", async () => {
      await repo.insertRow("users", {
        id: "5",
        name: "Eve",
        email: "",
        score: "8.8",
      });
      const row = await repo.getRow("users", { id: "5" });
      expect(row.email).toBeNull(); // empty string → null for nullable
      expect(row.score).toBe(8.8);
    });

    it("updateRow modifies a row", async () => {
      await repo.updateRow("users", { id: "1" }, { name: "Alicia", score: "10" });
      const row = await repo.getRow("users", { id: "1" });
      expect(row.name).toBe("Alicia");
      expect(row.score).toBe(10);
    });

    it("updateRow ignores PK columns in data", async () => {
      await repo.updateRow(
        "users",
        { id: "1" },
        { id: "999", name: "Alicia" },
      );
      const row = await repo.getRow("users", { id: "1" });
      expect(row.name).toBe("Alicia");
    });

    it("deleteRow removes a row", async () => {
      await repo.deleteRow("users", { id: "2" });
      const result = await repo.getRows("users");
      expect(result.total).toBe(2);
    });

    it("bulkDelete removes multiple rows", async () => {
      const deleted = await repo.bulkDelete("users", ["1", "3"]);
      expect(deleted).toBe(2);
      const result = await repo.getRows("users");
      expect(result.total).toBe(1);
      expect((result.rows[0] as Record<string, unknown>).name).toBe("Bob");
    });
  });

  describe("composite PK", () => {
    beforeEach(() => {
      ({ db } = createTestDb(COMPOSITE_SCHEMA));
      repo = new TableRepository(db);
    });

    it("getRow with composite PK", async () => {
      const row = await repo.getRow("memberships", {
        user_id: "1",
        group_id: "10",
      });
      expect(row.role).toBe("admin");
    });

    it("updateRow with composite PK", async () => {
      await repo.updateRow(
        "memberships",
        { user_id: "1", group_id: "10" },
        { role: "superadmin" },
      );
      const row = await repo.getRow("memberships", {
        user_id: "1",
        group_id: "10",
      });
      expect(row.role).toBe("superadmin");
    });

    it("deleteRow with composite PK", async () => {
      await repo.deleteRow("memberships", {
        user_id: "2",
        group_id: "10",
      });
      const result = await repo.getRows("memberships");
      expect(result.total).toBe(2);
    });

    it("bulkDelete with composite PKs", async () => {
      const deleted = await repo.bulkDelete("memberships", [
        "1,10",
        "2,10",
      ]);
      expect(deleted).toBe(2);
      const result = await repo.getRows("memberships");
      expect(result.total).toBe(1);
    });
  });

  describe("validation", () => {
    beforeEach(() => {
      ({ db } = createTestDb(SCHEMA));
      repo = new TableRepository(db);
    });

    it("rejects insertRow with no valid columns", async () => {
      await expect(
        repo.insertRow("users", { bogus: "value" }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects updateRow with only PK columns", async () => {
      await expect(
        repo.updateRow("users", { id: "1" }, { id: "999" }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("insertRow return value", () => {
    it("returns the full row including auto-generated INTEGER PK", async () => {
      ({ db } = createTestDb(`
        CREATE TABLE notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          body TEXT NOT NULL,
          status TEXT DEFAULT 'draft'
        );
      `));
      repo = new TableRepository(db);

      const row = await repo.insertRow("notes", { body: "hello" });
      expect(row.id).toBe(1);
      expect(row.body).toBe("hello");
      expect(row.status).toBe("draft");
    });

    it("returns the full row when single TEXT PK is filled by DEFAULT", async () => {
      // INSERT … RETURNING * surfaces the auto-generated PK regardless of
      // affinity, so afterInsert hooks see the resolved slug.
      ({ db } = createTestDb(`
        CREATE TABLE items (
          slug TEXT PRIMARY KEY DEFAULT 'auto-slug',
          name TEXT NOT NULL
        );
      `));
      repo = new TableRepository(db);

      const row = await repo.insertRow("items", { name: "thing" });
      expect(row.slug).toBe("auto-slug");
      expect(row.name).toBe("thing");
    });

    it("returns the full row when a single TEXT PK is supplied", async () => {
      ({ db } = createTestDb(`
        CREATE TABLE items (
          slug TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );
      `));
      repo = new TableRepository(db);

      const row = await repo.insertRow("items", { slug: "manual", name: "x" });
      expect(row.slug).toBe("manual");
      expect(row.name).toBe("x");
    });
  });
});
