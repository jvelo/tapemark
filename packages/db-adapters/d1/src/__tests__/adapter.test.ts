/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { describe, it, expect } from "vitest";
import {
  createD1Adapter,
  type D1Database,
  type D1PreparedStatement,
} from "../index";

interface FakeD1 {
  db: D1Database;
  /** Records each prepared query and the values it was bound with. */
  calls: { query: string; bound: unknown[] }[];
}

/** Minimal stand-in for `c.env.DB` that mirrors D1's `{ results }` shape. */
function fakeD1(rows: Record<string, unknown>[]): FakeD1 {
  const calls: { query: string; bound: unknown[] }[] = [];
  const db: D1Database = {
    prepare(query) {
      const call = { query, bound: [] as unknown[] };
      calls.push(call);
      const stmt: D1PreparedStatement = {
        bind(...values) {
          call.bound = values;
          return stmt;
        },
        all() {
          return Promise.resolve({ results: rows });
        },
        first() {
          return Promise.resolve(rows[0] ?? null);
        },
        run() {
          return Promise.resolve();
        },
      };
      return stmt;
    },
  };
  return { db, calls };
}

describe("createD1Adapter", () => {
  it("returns a Database-compatible object", () => {
    const { db } = fakeD1([]);
    expect(createD1Adapter(db).prepare).toBeDefined();
  });

  it("all() unwraps D1's { results } into a plain array", async () => {
    const rows = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ];
    const adapter = createD1Adapter(fakeD1(rows).db);

    const result = await adapter
      .prepare("SELECT * FROM users")
      .all<{ id: number; name: string }>();

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Alice");
  });

  it("first() passes the row through, and returns null when absent", async () => {
    const withRow = createD1Adapter(fakeD1([{ id: 1 }]).db);
    expect(await withRow.prepare("SELECT 1").first()).toEqual({ id: 1 });

    const empty = createD1Adapter(fakeD1([]).db);
    expect(await empty.prepare("SELECT 1").first()).toBeNull();
  });

  it("bind() is chainable and forwards bound values", async () => {
    const { db, calls } = fakeD1([]);

    await createD1Adapter(db)
      .prepare("SELECT * FROM users WHERE id = ? AND role = ?")
      .bind(42, "admin")
      .all();

    expect(calls).toHaveLength(1);
    expect(calls[0].bound).toEqual([42, "admin"]);
  });

  it("run() resolves for non-row statements", async () => {
    const adapter = createD1Adapter(fakeD1([]).db);
    await expect(
      adapter.prepare("DELETE FROM users WHERE id = ?").bind(1).run(),
    ).resolves.toBeUndefined();
  });
});
