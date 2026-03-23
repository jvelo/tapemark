import { describe, it, expect, beforeEach } from "vitest";
import { SchemaIntrospector, NameValidationError, parseAffinity, isInternalTable } from "../schema";
import { createTestDb } from "../test-utils";
import type { Database } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SIMPLE_SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    age INTEGER DEFAULT 0
  );
  CREATE TABLE posts (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT,
    user_id INTEGER NOT NULL
  );
  INSERT INTO users (id, name, email, age) VALUES (1, 'Alice', 'alice@example.com', 30);
  INSERT INTO users (id, name, email, age) VALUES (2, 'Bob', NULL, 25);
  INSERT INTO posts (id, title, body, user_id) VALUES (1, 'Hello', 'World', 1);
`;

const COMPOSITE_PK_SCHEMA = `
  CREATE TABLE tag_assignments (
    post_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, tag_id)
  );
  INSERT INTO tag_assignments (post_id, tag_id) VALUES (1, 10);
  INSERT INTO tag_assignments (post_id, tag_id) VALUES (1, 20);
`;

const ALL_TYPES_SCHEMA = `
  CREATE TABLE all_types (
    id INTEGER PRIMARY KEY,
    text_col TEXT,
    varchar_col VARCHAR(255),
    int_col INT,
    real_col REAL,
    float_col FLOAT,
    double_col DOUBLE,
    numeric_col NUMERIC,
    blob_col BLOB,
    bool_col BOOLEAN,
    untyped
  );
`;

const NO_PK_SCHEMA = `
  CREATE TABLE loose_rows (
    name TEXT,
    value TEXT
  );
  INSERT INTO loose_rows VALUES ('a', '1');
  INSERT INTO loose_rows VALUES ('b', '2');
`;

// ---------------------------------------------------------------------------
// parseAffinity
// ---------------------------------------------------------------------------

describe("parseAffinity", () => {
  it("maps INT-containing types to integer", () => {
    expect(parseAffinity("INTEGER")).toBe("integer");
    expect(parseAffinity("INT")).toBe("integer");
    expect(parseAffinity("BIGINT")).toBe("integer");
    expect(parseAffinity("TINYINT")).toBe("integer");
  });

  it("maps TEXT/CHAR/CLOB to text", () => {
    expect(parseAffinity("TEXT")).toBe("text");
    expect(parseAffinity("VARCHAR(255)")).toBe("text");
    expect(parseAffinity("CLOB")).toBe("text");
    expect(parseAffinity("CHARACTER(20)")).toBe("text");
  });

  it("maps REAL/FLOAT/DOUBLE to real", () => {
    expect(parseAffinity("REAL")).toBe("real");
    expect(parseAffinity("FLOAT")).toBe("real");
    expect(parseAffinity("DOUBLE")).toBe("real");
    expect(parseAffinity("DOUBLE PRECISION")).toBe("real");
  });

  it("maps BLOB and empty string to blob", () => {
    expect(parseAffinity("BLOB")).toBe("blob");
    expect(parseAffinity("")).toBe("blob");
  });

  it("falls back to numeric", () => {
    expect(parseAffinity("NUMERIC")).toBe("numeric");
    expect(parseAffinity("BOOLEAN")).toBe("numeric");
    expect(parseAffinity("DATE")).toBe("numeric");
  });
});

// ---------------------------------------------------------------------------
// isInternalTable
// ---------------------------------------------------------------------------

describe("isInternalTable", () => {
  it("filters tapemark tables", () => {
    expect(isInternalTable("_tapemark_meta")).toBe(true);
    expect(isInternalTable("_tapemark_table_config")).toBe(true);
  });

  it("filters CF and sqlite tables", () => {
    expect(isInternalTable("_cf_METADATA")).toBe(true);
    expect(isInternalTable("sqlite_sequence")).toBe(true);
  });

  it("allows user tables", () => {
    expect(isInternalTable("users")).toBe(false);
    expect(isInternalTable("my_table")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SchemaIntrospector
// ---------------------------------------------------------------------------

describe("SchemaIntrospector", () => {
  let db: Database;
  let introspector: SchemaIntrospector;

  describe("with simple schema", () => {
    beforeEach(() => {
      ({ db } = createTestDb(SIMPLE_SCHEMA));
      introspector = new SchemaIntrospector(db);
    });

    it("lists table names excluding internals", async () => {
      const names = await introspector.getTableNames();
      expect(names).toEqual(["posts", "users"]);
    });

    it("gets table info with columns and PK", async () => {
      const table = await introspector.getTable("users");
      expect(table.name).toBe("users");
      expect(table.rowCount).toBe(2);
      expect(table.primaryKey).toEqual(["id"]);
      expect(table.columns).toHaveLength(4);

      const idCol = table.columns.find((c) => c.name === "id")!;
      expect(idCol.affinity).toBe("integer");
      expect(idCol.primaryKeyPosition).toBe(1);
      // INTEGER PRIMARY KEY is the rowid alias — effectively NOT NULL, but
      // SQLite's PRAGMA table_info reports notnull=0 for it.
      expect(idCol.nullable).toBe(true);

      const emailCol = table.columns.find((c) => c.name === "email")!;
      expect(emailCol.nullable).toBe(true);
      expect(emailCol.primaryKeyPosition).toBeNull();

      const ageCol = table.columns.find((c) => c.name === "age")!;
      expect(ageCol.defaultValue).toBe("0");
    });

    it("returns all tables with getTables()", async () => {
      const tables = await introspector.getTables();
      expect(tables).toHaveLength(2);
      expect(tables.map((t) => t.name).sort()).toEqual(["posts", "users"]);
    });

    it("computes a schema hash", async () => {
      const schema = await introspector.getSchema();
      expect(schema.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(schema.tables).toHaveLength(2);
    });

    it("schema hash is stable", async () => {
      const hash1 = (await introspector.getSchema()).hash;
      const hash2 = (await introspector.getSchema()).hash;
      expect(hash1).toBe(hash2);
    });
  });

  describe("with composite primary key", () => {
    beforeEach(() => {
      ({ db } = createTestDb(COMPOSITE_PK_SCHEMA));
      introspector = new SchemaIntrospector(db);
    });

    it("detects composite PK columns in order", async () => {
      const table = await introspector.getTable("tag_assignments");
      expect(table.primaryKey).toEqual(["post_id", "tag_id"]);
      expect(table.rowCount).toBe(2);
    });

    it("marks PK positions correctly", async () => {
      const table = await introspector.getTable("tag_assignments");
      const postIdCol = table.columns.find((c) => c.name === "post_id")!;
      const tagIdCol = table.columns.find((c) => c.name === "tag_id")!;
      expect(postIdCol.primaryKeyPosition).toBe(1);
      expect(tagIdCol.primaryKeyPosition).toBe(2);
    });
  });

  describe("with all column types", () => {
    beforeEach(() => {
      ({ db } = createTestDb(ALL_TYPES_SCHEMA));
      introspector = new SchemaIntrospector(db);
    });

    it("parses all affinities correctly", async () => {
      const table = await introspector.getTable("all_types");
      const byName = new Map(table.columns.map((c) => [c.name, c]));

      expect(byName.get("text_col")!.affinity).toBe("text");
      expect(byName.get("varchar_col")!.affinity).toBe("text");
      expect(byName.get("int_col")!.affinity).toBe("integer");
      expect(byName.get("real_col")!.affinity).toBe("real");
      expect(byName.get("float_col")!.affinity).toBe("real");
      expect(byName.get("double_col")!.affinity).toBe("real");
      expect(byName.get("numeric_col")!.affinity).toBe("numeric");
      expect(byName.get("blob_col")!.affinity).toBe("blob");
      expect(byName.get("bool_col")!.affinity).toBe("numeric");
      expect(byName.get("untyped")!.affinity).toBe("blob");
    });
  });

  describe("with no primary key", () => {
    beforeEach(() => {
      ({ db } = createTestDb(NO_PK_SCHEMA));
      introspector = new SchemaIntrospector(db);
    });

    it("returns empty PK array", async () => {
      const table = await introspector.getTable("loose_rows");
      expect(table.primaryKey).toEqual([]);
      expect(table.rowCount).toBe(2);
    });
  });

  describe("name validation", () => {
    beforeEach(() => {
      ({ db } = createTestDb(SIMPLE_SCHEMA));
      introspector = new SchemaIntrospector(db);
    });

    it("rejects invalid table names", async () => {
      await expect(introspector.assertTable("'; DROP TABLE users;--"))
        .rejects.toThrow(NameValidationError);
    });

    it("rejects non-existent tables", async () => {
      await expect(introspector.assertTable("nonexistent"))
        .rejects.toThrow(NameValidationError);
    });

    it("accepts valid tables", async () => {
      await expect(introspector.assertTable("users")).resolves.toBeUndefined();
    });

    it("rejects invalid column names", async () => {
      await expect(introspector.assertColumn("users", "fake_col"))
        .rejects.toThrow(NameValidationError);
    });

    it("accepts valid columns", async () => {
      await expect(
        introspector.assertColumn("users", "email"),
      ).resolves.toBeUndefined();
    });
  });
});
