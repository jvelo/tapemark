/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTapemark, type TapemarkCore } from "../router";
import { TableRepository } from "../repository";
import { createTestDb } from "../test-utils";
import type { CellValue, Database, RowAction, TableHooks, TapemarkRequest } from "../types";

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

describe("Custom row actions", () => {
  let db: Database;
  let core: TapemarkCore;

  beforeEach(() => {
    ({ db } = createTestDb(SCHEMA));
  });

  // The router fills route params from the path, so `get`/`post` only need a
  // path — no explicit `params`.
  function mount(
    actions: Record<string, RowAction>,
    opts: { readonly?: boolean; hooks?: TableHooks } = {},
  ): TapemarkCore {
    return createTapemark({ db, tables: { notes: { ...opts, actions } } });
  }

  function get(path: string) {
    return core.handle(req({ path }));
  }

  function post(actionName: string, pk = "1", body?: Record<string, string>) {
    return core.handle(
      req({ method: "POST", path: `/notes/${pk}/_action/${actionName}`, body }),
    );
  }

  it("renders action buttons on the row detail page", async () => {
    core = mount({
      publish: { label: "publish note", handler: () => ({ success: true }) },
    });

    const res = await get("/notes/1");

    expect(res.status).toBe(200);
    expect(res.html).toContain("publish note");
    expect(res.html).toContain("/notes/1/_action/publish");
  });

  it("dispatches the action and redirects with success flash", async () => {
    const calls: { pk: Record<string, string>; db: Database }[] = [];
    core = mount({
      publish: {
        label: "publish",
        handler: (pk, ctx) => {
          calls.push({ pk, db: ctx.db });
          return { success: true, message: "published" };
        },
      },
    });

    const res = await post("publish");

    expect(res.status).toBe(302);
    expect(res.redirect).toBe("/notes/1?flash=success&msg=published");
    expect(calls).toEqual([{ pk: { id: "1" }, db }]);
  });

  it("surfaces handler failure as an error flash", async () => {
    core = mount({
      fail: { label: "fail", handler: () => ({ success: false, message: "nope" }) },
    });

    const res = await post("fail");

    expect(res.status).toBe(302);
    expect(res.redirect).toBe("/notes/1?flash=error&msg=nope");
  });

  it("treats a thrown exception as a failed action with the error message", async () => {
    core = mount({
      kaboom: {
        label: "kaboom",
        handler: () => {
          throw new Error("explosion");
        },
      },
    });

    const res = await post("kaboom");

    expect(res.status).toBe(302);
    expect(res.redirect).toContain("flash=error");
    expect(res.redirect).toContain("explosion");
  });

  it("returns 404 for an unregistered action", async () => {
    core = createTapemark({ db });
    const res = await post("nonexistent");

    expect(res.status).toBe(404);
  });

  it("refuses to run actions on a readonly table", async () => {
    core = mount(
      { publish: { label: "publish", handler: () => ({ success: true }) } },
      { readonly: true },
    );

    const res = await post("publish");

    expect(res.status).toBe(403);
  });

  it("does not render action buttons when the table is readonly", async () => {
    core = mount(
      { publish: { label: "publish note", handler: () => ({ success: true }) } },
      { readonly: true },
    );

    const res = await get("/notes/1");

    expect(res.status).toBe(200);
    expect(res.html).not.toContain("publish note");
  });

  describe("visible predicate", () => {
    it("hides the action on the row detail page when visible() returns false", async () => {
      core = mount({
        publish: {
          label: "publish",
          handler: () => ({ success: true }),
          visible: (row) => row.tag !== "draft",
        },
      });

      // Note 1 has tag='draft' → action should be hidden
      const drafted = await get("/notes/1");
      expect(drafted.html).not.toContain(">publish<");

      // Note 2 has tag=null → action should show
      const ready = await get("/notes/2");
      expect(ready.html).toContain(">publish<");
    });

    it("filters per-row action buttons in the table list", async () => {
      core = mount({
        clear_tag: {
          label: "clear tag",
          display: { list: true },
          handler: () => ({ success: true }),
          visible: (row) => row.tag !== null,
        },
      });

      const res = await get("/notes");
      // Row 1 has a tag → button should render and target /notes/1/_action/clear_tag
      expect(res.html).toContain('action="/notes/1/_action/clear_tag"');
      // Row 2 has tag=null → no button form should be emitted for it
      expect(res.html).not.toContain('action="/notes/2/_action/clear_tag"');
    });

    it("treats a thrown predicate as 'not visible' and does not crash the page", async () => {
      core = mount({
        flaky: {
          label: "flaky",
          handler: () => ({ success: true }),
          visible: () => {
            throw new Error("predicate exploded");
          },
        },
      });

      const res = await get("/notes/1");
      expect(res.status).toBe(200);
      expect(res.html).not.toContain(">flaky<");
    });

    it("does not enforce visibility on the action route (UI hint only)", async () => {
      // The predicate hides the button, but the action route itself runs
      // the handler if invoked directly. Documented behavior.
      const calls: number[] = [];
      core = mount({
        shouldnt_show: {
          label: "shouldn't show",
          handler: () => {
            calls.push(1);
            return { success: true };
          },
          visible: () => false,
        },
      });

      const res = await post("shouldnt_show");
      expect(res.status).toBe(302);
      expect(calls).toEqual([1]);
    });
  });

  describe("display placement", () => {
    it("renders an actions column on the list when at least one action opts in via display.list", async () => {
      core = mount({
        quick: { label: "quick", handler: () => ({ success: true }), display: { list: true } },
        detail_only: { label: "detail only", handler: () => ({ success: true }) },
      });

      const res = await get("/notes");
      expect(res.status).toBe(200);
      expect(res.html).toContain('class="tm-row-action-col"');
      expect(res.html).toContain(">quick<");
      // detail_only must NOT render in the list (default for `list` is false)
      expect(res.html).not.toContain(">detail only<");
    });

    it("does not render an actions column when no actions opt in via display.list", async () => {
      core = mount({
        detail_only: { label: "detail only", handler: () => ({ success: true }) },
      });

      const res = await get("/notes");
      expect(res.html).not.toContain('class="tm-row-action-col"');
    });

    it("hides the action on row detail when display.detail is false", async () => {
      // List-only action — useful for ops you only want to expose as a quick
      // gesture without cluttering the row form.
      core = mount({
        quick: {
          label: "quick",
          handler: () => ({ success: true }),
          display: { detail: false, list: true },
        },
      });

      const detail = await get("/notes/1");
      expect(detail.html).not.toContain(">quick<");

      const list = await get("/notes");
      expect(list.html).toContain(">quick<");
    });

    it("redirects back to the table list when invoked with _back=table", async () => {
      core = mount({
        ping: {
          label: "ping",
          handler: () => ({ success: true, message: "pong" }),
          display: { list: true },
        },
      });

      const res = await post("ping", "1", { _back: "table" });
      expect(res.status).toBe(302);
      // No /:pk segment in the redirect — back to /notes
      expect(res.redirect).toBe("/notes?flash=success&msg=pong");
    });

    it("does not render in-table action buttons when the table is readonly", async () => {
      // Regression: list view used to keep showing buttons that the route
      // would then 403, exposing actions that couldn't succeed.
      core = mount(
        { ping: { label: "ping", display: { list: true }, handler: () => ({ success: true }) } },
        { readonly: true },
      );

      const res = await get("/notes");
      expect(res.html).not.toContain('class="tm-row-action-col"');
      expect(res.html).not.toContain(">ping<");
    });

    it("still redirects to the row detail when no _back hint is given", async () => {
      core = mount({
        ping: { label: "ping", handler: () => ({ success: true }) },
      });

      const res = await post("ping");
      expect(res.redirect).toContain("/notes/1?flash=success");
    });
  });

  describe("dropdown grouping", () => {
    it("collapses list actions sharing a group into one popover menu", async () => {
      core = mount({
        csv: { label: "CSV", group: "Export", display: { list: true }, handler: () => ({ success: true }) },
        json: { label: "JSON", group: "Export", display: { list: true }, handler: () => ({ success: true }) },
        archive: { label: "Archive", display: { list: true }, handler: () => ({ success: true }) },
      });

      const res = await get("/notes");
      expect(res.status).toBe(200);
      // One trigger labeled by the group, wired to a popover panel of the same id
      // (pk + render index + readable slug).
      expect(res.html).toContain('popovertarget="tm-menu-1-0-export"');
      expect(res.html).toContain('id="tm-menu-1-0-export"');
      expect(res.html).toContain("Export ▾");
      // Grouped items submit the per-row action forms by reference.
      expect(res.html).toContain('form="tm-act-1-csv"');
      expect(res.html).toContain('form="tm-act-1-json"');
      // The ungrouped action stays a standalone inline button.
      expect(res.html).toContain('form="tm-act-1-archive"');
      expect(res.html).not.toContain("Archive ▾");
    });

    it("groups detail actions under a popover menu while keeping their endpoints", async () => {
      core = mount({
        csv: { label: "CSV", group: "Export", handler: () => ({ success: true }) },
        json: { label: "JSON", group: "Export", handler: () => ({ success: true }) },
      });

      const res = await get("/notes/1");
      expect(res.status).toBe(200);
      expect(res.html).toContain('popovertarget="tm-menu-0-export"');
      expect(res.html).toContain('id="tm-menu-0-export"');
      expect(res.html).toContain("Export ▾");
      // Each menu item still posts to its own action endpoint.
      expect(res.html).toContain("/notes/1/_action/csv");
      expect(res.html).toContain("/notes/1/_action/json");
    });

    it("gives groups with slug-colliding labels distinct popover ids", async () => {
      core = mount({
        a: { label: "A", group: "Export!", display: { list: true }, handler: () => ({ success: true }) },
        b: { label: "B", group: "Export?", display: { list: true }, handler: () => ({ success: true }) },
      });

      const res = await get("/notes");
      expect(res.status).toBe(200);
      const ids = [...res.html!.matchAll(/id="(tm-menu-[^"]*)"/g)].map((m) => m[1]);
      // Two groups per row whose slugs both reduce to "export", across two rows:
      // four panels, all uniquely addressable by popovertarget.
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(res.html).toContain(`popovertarget="${id}"`);
      }
    });
  });

  describe("ctx.update (writes ownership)", () => {
    it("writes only the declared columns, leaving siblings untouched", async () => {
      core = mount({
        act: {
          label: "act",
          writes: ["tag"],
          handler: async (_pk, ctx) => {
            await ctx.update({ tag: "published" });
            return { success: true };
          },
        },
      });

      const res = await post("act");
      expect(res.redirect).toContain("flash=success");
      const row = await new TableRepository(db).getRow("notes", { id: "1" });
      expect(row.tag).toBe("published");
      expect(row.body).toBe("first");
    });

    it("updates any real non-PK column when no writes is declared", async () => {
      core = mount({
        act: {
          label: "act",
          handler: async (_pk, ctx) => {
            await ctx.update({ tag: "x" });
            return { success: true };
          },
        },
      });

      const res = await post("act");
      expect(res.redirect).toContain("flash=success");
      const row = await new TableRepository(db).getRow("notes", { id: "1" });
      expect(row.tag).toBe("x");
    });

    it("rejects a column outside the action's writes and writes nothing", async () => {
      core = mount({
        act: {
          label: "act",
          writes: ["tag"],
          handler: async (_pk, ctx) => {
            await ctx.update({ body: "clobbered" });
            return { success: true };
          },
        },
      });

      const res = await post("act");
      expect(res.redirect).toContain("flash=error");
      expect(decodeURIComponent(res.redirect!)).toContain("body");
      const row = await new TableRepository(db).getRow("notes", { id: "1" });
      expect(row.body).toBe("first");
    });

    it("rejects a declared column that isn't on the table", async () => {
      core = mount({
        act: {
          label: "act",
          writes: ["tga"], // typo for "tag"
          handler: async (_pk, ctx) => {
            await ctx.update({ tga: "oops" });
            return { success: true };
          },
        },
      });

      const res = await post("act");
      expect(res.redirect).toContain("flash=error");
      expect(decodeURIComponent(res.redirect!)).toContain("tga");
    });

    it("rejects an unknown column even without a writes declaration", async () => {
      core = mount({
        act: {
          label: "act",
          handler: async (_pk, ctx) => {
            await ctx.update({ nope: "x" });
            return { success: true };
          },
        },
      });

      const res = await post("act");
      expect(res.redirect).toContain("flash=error");
      expect(decodeURIComponent(res.redirect!)).toContain("nope");
    });

    it("fails on a row that doesn't exist", async () => {
      core = mount({
        act: {
          label: "act",
          handler: async (_pk, ctx) => {
            await ctx.update({ tag: "x" });
            return { success: true };
          },
        },
      });

      const res = await post("act", "999");
      expect(res.redirect).toContain("flash=error");
    });

    it("fires afterUpdate with the effective patch, excluding PK columns", async () => {
      const received: { pk: Record<string, string>; patch: Record<string, CellValue> }[] = [];
      core = mount(
        {
          act: {
            label: "act",
            writes: ["tag"],
            handler: async (_pk, ctx) => {
              await ctx.update({ id: "1", tag: "x" });
              return { success: true };
            },
          },
        },
        {
          hooks: {
            afterUpdate: (pk, patch) => {
              received.push({ pk, patch });
            },
          },
        },
      );

      const res = await post("act");
      expect(res.redirect).toContain("flash=success");
      expect(received).toHaveLength(1);
      expect(received[0].pk).toEqual({ id: "1" });
      expect(received[0].patch).toEqual({ tag: "x" });
    });

    it("surfaces a failing afterUpdate as a warning flash, not an error", async () => {
      core = mount(
        {
          act: {
            label: "act",
            handler: async (_pk, ctx) => {
              await ctx.update({ tag: "x" });
              return { success: true, message: "tagged" };
            },
          },
        },
        {
          hooks: {
            afterUpdate: () => {
              throw new Error("index down");
            },
          },
        },
      );

      const res = await post("act");
      const redirect = decodeURIComponent(res.redirect!);
      expect(redirect).toContain("flash=warning");
      expect(redirect).toContain("tagged");
      expect(redirect).toContain("index down");
      // the write committed even though the hook failed
      const row = await new TableRepository(db).getRow("notes", { id: "1" });
      expect(row.tag).toBe("x");
    });
  });
});
