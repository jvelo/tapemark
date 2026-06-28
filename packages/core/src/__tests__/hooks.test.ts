/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTapemark } from "../router";
import { createTestDb } from "../test-utils";
import type { CellValue, Database, HookContext, TapemarkRequest } from "../types";

const SCHEMA = `
  CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    body TEXT NOT NULL,
    tag TEXT
  );
  INSERT INTO notes (id, body, tag) VALUES (1, 'first', 'draft');
  INSERT INTO notes (id, body, tag) VALUES (2, 'second', NULL);
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

describe("Lifecycle hooks", () => {
  let db: Database;

  beforeEach(() => {
    ({ db } = createTestDb(SCHEMA));
  });

  describe("afterInsert", () => {
    it("fires after a row is inserted and sees auto-generated PK", async () => {
      const received: { row: Record<string, CellValue>; ctx: HookContext }[] = [];
      const core = createTapemark({
        db,
        tables: {
          notes: {
            hooks: {
              afterInsert: (row, ctx) => {
                received.push({ row, ctx });
              },
            },
          },
        },
      });

      const res = await core.handle(
        req({
          method: "POST",
          path: "/notes/new",
          params: { table: "notes" },
          body: { body: "third", tag: "new" },
        }),
      );

      expect(res.status).toBe(302);
      expect(received).toHaveLength(1);
      // PK was auto-generated — hook sees id=3 even though submitted body didn't include it
      expect(received[0].row.id).toBe(3);
      expect(received[0].row.body).toBe("third");
      expect(received[0].row.tag).toBe("new");
    });

    it("a hook that throws becomes a warning flash, row is still created", async () => {
      const core = createTapemark({
        db,
        tables: {
          notes: {
            hooks: {
              afterInsert: () => {
                throw new Error("boom");
              },
            },
          },
        },
      });

      const res = await core.handle(
        req({
          method: "POST",
          path: "/notes/new",
          params: { table: "notes" },
          body: { body: "fourth" },
        }),
      );

      expect(res.status).toBe(302);
      expect(res.redirect).toContain("flash=warning");
      expect(res.redirect).toMatch(/hook%20failed[^&]*boom/);

      // Row was still inserted
      const rows = await db
        .prepare("SELECT body FROM notes WHERE id = ?")
        .bind(3)
        .first<{ body: string }>();
      expect(rows?.body).toBe("fourth");
    });

    it("forwards env from the adapter into the hook context", async () => {
      const sentinel = Symbol("env");
      let capturedEnv: unknown;
      const core = createTapemark({
        db,
        tables: {
          notes: {
            hooks: {
              afterInsert: (_row, ctx) => {
                capturedEnv = ctx.env;
              },
            },
          },
        },
      });

      await core.handle(
        req({
          method: "POST",
          path: "/notes/new",
          params: { table: "notes" },
          body: { body: "fifth" },
        }),
        { db, env: sentinel },
      );

      expect(capturedEnv).toBe(sentinel);
    });

    it("ctx.background dispatches via executionContext.waitUntil when available", async () => {
      const enqueued: Promise<unknown>[] = [];
      const ec = {
        waitUntil: (p: Promise<unknown>) => {
          enqueued.push(p);
        },
      };
      let workResolved = false;
      const core = createTapemark({
        db,
        tables: {
          notes: {
            hooks: {
              afterInsert: async (_row, ctx) => {
                await ctx.background(
                  new Promise<void>((resolve) =>
                    setTimeout(() => {
                      workResolved = true;
                      resolve();
                    }, 50),
                  ),
                );
              },
            },
          },
        },
      });

      const res = await core.handle(
        req({
          method: "POST",
          path: "/notes/new",
          params: { table: "notes" },
          body: { body: "bg" },
        }),
        { db, executionContext: ec },
      );

      // Hook returned promptly — work was enqueued, not awaited.
      expect(res.status).toBe(302);
      expect(enqueued).toHaveLength(1);
      expect(workResolved).toBe(false);

      // Work eventually resolves on its own (Workers would keep it alive via waitUntil).
      await enqueued[0];
      expect(workResolved).toBe(true);
    });

    it("ctx.background awaits the work inline when executionContext is absent", async () => {
      let workResolved = false;
      const core = createTapemark({
        db,
        tables: {
          notes: {
            hooks: {
              afterInsert: async (_row, ctx) => {
                await ctx.background(
                  new Promise<void>((resolve) =>
                    setTimeout(() => {
                      workResolved = true;
                      resolve();
                    }, 20),
                  ),
                );
              },
            },
          },
        },
      });

      const res = await core.handle(
        req({
          method: "POST",
          path: "/notes/new",
          params: { table: "notes" },
          body: { body: "sync" },
        }),
        { db },
      );

      // Hook awaited the work inline — by the time we return, it has resolved.
      expect(res.status).toBe(302);
      expect(workResolved).toBe(true);
    });

    it("does not fire on tables that have no hooks configured", async () => {
      const core = createTapemark({ db });
      const res = await core.handle(
        req({
          method: "POST",
          path: "/notes/new",
          params: { table: "notes" },
          body: { body: "no-hook" },
        }),
      );
      expect(res.status).toBe(302);
      expect(res.redirect).toContain("flash=success");
    });
  });

  describe("afterUpdate", () => {
    it("fires with pkValues and patch", async () => {
      const received: { pk: Record<string, string>; patch: Record<string, CellValue> }[] = [];
      const core = createTapemark({
        db,
        tables: {
          notes: {
            hooks: {
              afterUpdate: (pk, patch) => {
                received.push({ pk, patch });
              },
            },
          },
        },
      });

      const res = await core.handle(
        req({
          method: "POST",
          path: "/notes/1",
          params: { table: "notes", pk: "1" },
          body: { body: "updated" },
        }),
      );

      expect(res.status).toBe(302);
      expect(received).toHaveLength(1);
      expect(received[0].pk).toEqual({ id: "1" });
      expect(received[0].patch).toEqual({ body: "updated" });
    });
  });

  describe("afterDelete", () => {
    it("fires with pkValues after row is deleted", async () => {
      const received: Record<string, string>[] = [];
      const core = createTapemark({
        db,
        tables: {
          notes: {
            hooks: {
              afterDelete: (pk) => {
                received.push(pk);
              },
            },
          },
        },
      });

      const res = await core.handle(
        req({
          method: "POST",
          path: "/notes/1/delete",
          params: { table: "notes", pk: "1" },
        }),
      );

      expect(res.status).toBe(302);
      expect(received).toEqual([{ id: "1" }]);
    });
  });
});
