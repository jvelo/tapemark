/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SchemaIntrospector } from "../schema";
import { resolveReferenceLabels } from "../references";
import { createTestDb } from "../test-utils";
import type { Database, ForeignKey, TableConfig } from "../types";

const FK_SCHEMA = `
  CREATE TABLE authors (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE books (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    author_id INTEGER NOT NULL REFERENCES authors(id)
  );
  INSERT INTO authors VALUES (1, 'Alice');
  INSERT INTO authors VALUES (2, 'Bob');
`;

describe("resolveReferenceLabels", () => {
  let db: Database;
  let foreignKeys: ForeignKey[];

  beforeEach(async () => {
    ({ db } = createTestDb(FK_SCHEMA));
    foreignKeys = (await new SchemaIntrospector(db).getTable("books")).foreignKeys;
  });

  const rows = [{ author_id: 1 }, { author_id: 2 }];

  it("preserves top-level config fields like order through label resolution", async () => {
    const config: TableConfig = {
      order: ["title", "author_id", "id"],
      columns: { author_id: { display: "reference" } },
    };

    const merged = await resolveReferenceLabels(db, foreignKeys, rows, config, "/admin");

    expect(merged.order).toEqual(["title", "author_id", "id"]);
  });

  it("injects resolved labels into the FK column", async () => {
    const config: TableConfig = { columns: {} };

    const merged = await resolveReferenceLabels(db, foreignKeys, rows, config, "/admin");

    expect(merged.columns?.author_id?.options?._labels).toEqual({ "1": "Alice", "2": "Bob" });
  });

  it("returns the config untouched when there are no single-column FKs", async () => {
    const config: TableConfig = { order: ["id", "title"], columns: {} };

    const merged = await resolveReferenceLabels(db, [], rows, config, "/admin");

    expect(merged).toBe(config);
  });
});
