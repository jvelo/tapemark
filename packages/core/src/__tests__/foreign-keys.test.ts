/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SchemaIntrospector } from "../schema";
import { createTestDb } from "../test-utils";
import { createTapemark } from "../router";
import { pickLabelColumn } from "../routes/lookup";
import type { Database, TapemarkRequest } from "../types";
import type { TapemarkCore } from "../router";

const FK_SCHEMA = `
  CREATE TABLE authors (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT
  );
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL
  );
  CREATE TABLE books (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    author_id INTEGER NOT NULL REFERENCES authors(id),
    category_id INTEGER REFERENCES categories(id)
  );
  CREATE TABLE book_tags (
    book_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (book_id, tag),
    FOREIGN KEY (book_id) REFERENCES books(id)
  );
  INSERT INTO authors VALUES (1, 'Alice', 'alice@example.com');
  INSERT INTO authors VALUES (2, 'Bob', 'bob@example.com');
  INSERT INTO authors VALUES (3, 'Carol', NULL);
  INSERT INTO categories VALUES (1, 'Fiction');
  INSERT INTO categories VALUES (2, 'Non-Fiction');
  INSERT INTO books VALUES (1, 'Book A', 1, 1);
  INSERT INTO books VALUES (2, 'Book B', 2, NULL);
  INSERT INTO book_tags VALUES (1, 'sci-fi');
  INSERT INTO book_tags VALUES (1, 'space');
`;

function req(overrides: Partial<TapemarkRequest> = {}): TapemarkRequest {
  return {
    method: "GET",
    path: "/",
    params: {},
    query: {},
    ...overrides,
  };
}

describe("Foreign key introspection", () => {
  let db: Database;
  let introspector: SchemaIntrospector;

  beforeEach(() => {
    ({ db } = createTestDb(FK_SCHEMA));
    introspector = new SchemaIntrospector(db);
  });

  it("detects single-column foreign keys", async () => {
    const books = await introspector.getTable("books");
    expect(books.foreignKeys).toHaveLength(2);

    const authorFk = books.foreignKeys.find((fk) => fk.columns.includes("author_id"));
    expect(authorFk).toBeDefined();
    expect(authorFk!.referencedTable).toBe("authors");
    expect(authorFk!.referencedColumns).toEqual(["id"]);

    const categoryFk = books.foreignKeys.find((fk) => fk.columns.includes("category_id"));
    expect(categoryFk).toBeDefined();
    expect(categoryFk!.referencedTable).toBe("categories");
  });

  it("detects FK on junction table", async () => {
    const bookTags = await introspector.getTable("book_tags");
    expect(bookTags.foreignKeys).toHaveLength(1);
    expect(bookTags.foreignKeys[0].columns).toEqual(["book_id"]);
    expect(bookTags.foreignKeys[0].referencedTable).toBe("books");
  });

  it("returns empty foreignKeys for tables without FKs", async () => {
    const authors = await introspector.getTable("authors");
    expect(authors.foreignKeys).toEqual([]);
  });

  it("returns empty foreignKeys for views", async () => {
    db.prepare("CREATE VIEW author_names AS SELECT id, name FROM authors").run();
    introspector = new SchemaIntrospector(db);
    const view = await introspector.getTable("author_names");
    expect(view.foreignKeys).toEqual([]);
  });
});

describe("pickLabelColumn", () => {
  let db: Database;
  let introspector: SchemaIntrospector;

  beforeEach(() => {
    ({ db } = createTestDb(FK_SCHEMA));
    introspector = new SchemaIntrospector(db);
  });

  it("picks 'name' when available", async () => {
    const authors = await introspector.getTable("authors");
    expect(pickLabelColumn(authors)).toBe("name");
  });

  it("picks 'title' when available", async () => {
    const categories = await introspector.getTable("categories");
    expect(pickLabelColumn(categories)).toBe("title");
  });

  it("returns first non-PK text column as fallback", async () => {
    const books = await introspector.getTable("books");
    expect(pickLabelColumn(books)).toBe("title");
  });

  it("returns null when no text columns exist", async () => {
    ({ db } = createTestDb("CREATE TABLE numbers (id INTEGER PRIMARY KEY, val INTEGER);"));
    introspector = new SchemaIntrospector(db);
    const numbers = await introspector.getTable("numbers");
    expect(pickLabelColumn(numbers)).toBeNull();
  });
});

describe("_lookup endpoint", () => {
  let core: TapemarkCore;

  beforeEach(() => {
    const { db } = createTestDb(FK_SCHEMA);
    core = createTapemark({ db, prefix: "/admin" });
  });

  it("returns { results, total } with value/label pairs", async () => {
    const res = await core.handle(req({
      path: "/authors/_lookup",
      params: { table: "authors" },
      query: {},
    }));
    expect(res.status).toBe(200);
    const data = JSON.parse(res.html!);
    expect(data.total).toBe(3);
    expect(data.results).toHaveLength(3);
    expect(data.results[0]).toHaveProperty("value");
    expect(data.results[0]).toHaveProperty("label");
  });

  it("filters by query string", async () => {
    const res = await core.handle(req({
      path: "/authors/_lookup",
      params: { table: "authors" },
      query: { q: "Ali" },
    }));
    const data = JSON.parse(res.html!);
    expect(data.total).toBe(1);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].label).toBe("Alice");
  });

  it("respects limit parameter", async () => {
    const res = await core.handle(req({
      path: "/authors/_lookup",
      params: { table: "authors" },
      query: { limit: "1" },
    }));
    const data = JSON.parse(res.html!);
    expect(data.results).toHaveLength(1);
    expect(data.total).toBe(3);
  });

  it("looks up by exact value", async () => {
    const res = await core.handle(req({
      path: "/authors/_lookup",
      params: { table: "authors" },
      query: { value: "2" },
    }));
    const data = JSON.parse(res.html!);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].label).toBe("Bob");
  });

  it("supports label column override", async () => {
    const res = await core.handle(req({
      path: "/authors/_lookup",
      params: { table: "authors" },
      query: { label: "email" },
    }));
    const data = JSON.parse(res.html!);
    const alice = data.results.find((d: { value: number }) => d.value === 1);
    expect(alice.label).toBe("alice@example.com");
  });
});

describe("reference display in forms", () => {
  let core: TapemarkCore;

  beforeEach(() => {
    const { db } = createTestDb(FK_SCHEMA);
    core = createTapemark({ db, prefix: "/admin" });
  });

  it("renders tm-reference-input for FK columns in create form", async () => {
    const res = await core.handle(req({
      path: "/books/new",
    }));
    expect(res.status).toBe(200);
    expect(res.html).toContain("tm-reference-input");
    expect(res.html).toContain('data-table="authors"');
    expect(res.html).toContain('data-table="categories"');
  });

  it("renders tm-reference-input for FK columns in edit form", async () => {
    const res = await core.handle(req({
      path: "/books/1",
    }));
    expect(res.status).toBe(200);
    expect(res.html).toContain("tm-reference-input");
    expect(res.html).toContain('data-table="authors"');
  });

  it("shows FK hint in field metadata", async () => {
    const res = await core.handle(req({
      path: "/books/new",
    }));
    expect(res.html).toContain("\u2192 authors");
    expect(res.html).toContain("\u2192 categories");
  });
});

describe("reference labels in table view", () => {
  let core: TapemarkCore;

  beforeEach(() => {
    const { db } = createTestDb(FK_SCHEMA);
    core = createTapemark({ db, prefix: "/admin" });
  });

  it("resolves FK values to labels in the rows list", async () => {
    const res = await core.handle(req({ path: "/books" }));
    expect(res.status).toBe(200);
    // author_id=1 should resolve to "Alice", not just "1"
    expect(res.html).toContain("Alice");
    // category_id=1 should resolve to "Fiction"
    expect(res.html).toContain("Fiction");
  });

  it("renders resolved labels as links to the referenced row", async () => {
    const res = await core.handle(req({ path: "/books" }));
    expect(res.html).toContain("tm-cell-ref");
    expect(res.html).toContain("/admin/authors/1");
  });
});
