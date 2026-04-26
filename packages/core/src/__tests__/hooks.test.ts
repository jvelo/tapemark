import { describe, it, expect, beforeEach } from "vitest";
import { createTapemark, type TapemarkCore } from "../router";
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

    it("passes env and executionCtx through the hook context", async () => {
      const sentinel = Symbol("env");
      const ec = { waitUntil: () => {} };
      let captured: HookContext | null = null;
      const core = createTapemark({
        db,
        tables: {
          notes: {
            hooks: {
              afterInsert: (_row, ctx) => {
                captured = ctx;
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
        { db, env: sentinel, executionCtx: ec },
      );

      expect(captured).not.toBeNull();
      expect((captured as HookContext | null)!.env).toBe(sentinel);
      expect((captured as HookContext | null)!.executionCtx).toBe(ec);
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
      const received: { pk: Record<string, string>; patch: Record<string, string> }[] = [];
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

describe("Custom row actions", () => {
  let db: Database;
  let core: TapemarkCore;

  beforeEach(() => {
    ({ db } = createTestDb(SCHEMA));
  });

  it("renders action buttons on the row detail page", async () => {
    core = createTapemark({
      db,
      tables: {
        notes: {
          actions: {
            publish: { label: "publish note", handler: () => ({ ok: true }) },
          },
        },
      },
    });

    const res = await core.handle(
      req({ path: "/notes/1", params: { table: "notes", pk: "1" } }),
    );

    expect(res.status).toBe(200);
    expect(res.html).toContain("publish note");
    expect(res.html).toContain("/notes/1/_action/publish");
  });

  it("dispatches the action and redirects with success flash", async () => {
    const calls: { pk: Record<string, string>; db: Database }[] = [];
    core = createTapemark({
      db,
      tables: {
        notes: {
          actions: {
            publish: {
              label: "publish",
              handler: (pk, ctx) => {
                calls.push({ pk, db: ctx.db });
                return { ok: true, message: "published" };
              },
            },
          },
        },
      },
    });

    const res = await core.handle(
      req({
        method: "POST",
        path: "/notes/1/_action/publish",
        params: { table: "notes", pk: "1", actionName: "publish" },
      }),
    );

    expect(res.status).toBe(302);
    expect(res.redirect).toBe("/notes/1?flash=success&msg=published");
    expect(calls).toEqual([{ pk: { id: "1" }, db }]);
  });

  it("surfaces handler failure as an error flash", async () => {
    core = createTapemark({
      db,
      tables: {
        notes: {
          actions: {
            fail: {
              label: "fail",
              handler: () => ({ ok: false, message: "nope" }),
            },
          },
        },
      },
    });

    const res = await core.handle(
      req({
        method: "POST",
        path: "/notes/1/_action/fail",
        params: { table: "notes", pk: "1", actionName: "fail" },
      }),
    );

    expect(res.status).toBe(302);
    expect(res.redirect).toBe("/notes/1?flash=error&msg=nope");
  });

  it("treats a thrown exception as a failed action with the error message", async () => {
    core = createTapemark({
      db,
      tables: {
        notes: {
          actions: {
            kaboom: {
              label: "kaboom",
              handler: () => {
                throw new Error("explosion");
              },
            },
          },
        },
      },
    });

    const res = await core.handle(
      req({
        method: "POST",
        path: "/notes/1/_action/kaboom",
        params: { table: "notes", pk: "1", actionName: "kaboom" },
      }),
    );

    expect(res.status).toBe(302);
    expect(res.redirect).toContain("flash=error");
    expect(res.redirect).toContain("explosion");
  });

  it("returns 404 for an unregistered action", async () => {
    core = createTapemark({ db });
    const res = await core.handle(
      req({
        method: "POST",
        path: "/notes/1/_action/nonexistent",
        params: { table: "notes", pk: "1", actionName: "nonexistent" },
      }),
    );

    expect(res.status).toBe(404);
  });

  it("refuses to run actions on a readonly table", async () => {
    core = createTapemark({
      db,
      tables: {
        notes: {
          readonly: true,
          actions: {
            publish: { label: "publish", handler: () => ({ ok: true }) },
          },
        },
      },
    });

    const res = await core.handle(
      req({
        method: "POST",
        path: "/notes/1/_action/publish",
        params: { table: "notes", pk: "1", actionName: "publish" },
      }),
    );

    expect(res.status).toBe(403);
  });

  it("does not render action buttons when the table is readonly", async () => {
    core = createTapemark({
      db,
      tables: {
        notes: {
          readonly: true,
          actions: {
            publish: { label: "publish note", handler: () => ({ ok: true }) },
          },
        },
      },
    });

    const res = await core.handle(
      req({ path: "/notes/1", params: { table: "notes", pk: "1" } }),
    );

    expect(res.status).toBe(200);
    expect(res.html).not.toContain("publish note");
  });

  describe("visible predicate", () => {
    it("hides the action on the row detail page when visible() returns false", async () => {
      core = createTapemark({
        db,
        tables: {
          notes: {
            actions: {
              publish: {
                label: "publish",
                handler: () => ({ ok: true }),
                visible: (row) => row.tag !== "draft",
              },
            },
          },
        },
      });

      // Note 1 has tag='draft' → action should be hidden
      const drafted = await core.handle(
        req({ path: "/notes/1", params: { table: "notes", pk: "1" } }),
      );
      expect(drafted.html).not.toContain(">publish<");

      // Note 2 has tag=null → action should show
      const ready = await core.handle(
        req({ path: "/notes/2", params: { table: "notes", pk: "2" } }),
      );
      expect(ready.html).toContain(">publish<");
    });

    it("filters per-row action buttons in the table list", async () => {
      core = createTapemark({
        db,
        tables: {
          notes: {
            actions: {
              clear_tag: {
                label: "clear tag",
                inTable: true,
                handler: () => ({ ok: true }),
                visible: (row) => row.tag !== null,
              },
            },
          },
        },
      });

      const res = await core.handle(req({ path: "/notes" }));
      // Row 1 has a tag → button should render and target /notes/1/_action/clear_tag
      expect(res.html).toContain('action="/notes/1/_action/clear_tag"');
      // Row 2 has tag=null → no button form should be emitted for it
      expect(res.html).not.toContain('action="/notes/2/_action/clear_tag"');
    });

    it("treats a thrown predicate as 'not visible' and does not crash the page", async () => {
      core = createTapemark({
        db,
        tables: {
          notes: {
            actions: {
              flaky: {
                label: "flaky",
                handler: () => ({ ok: true }),
                visible: () => {
                  throw new Error("predicate exploded");
                },
              },
            },
          },
        },
      });

      const res = await core.handle(
        req({ path: "/notes/1", params: { table: "notes", pk: "1" } }),
      );
      expect(res.status).toBe(200);
      expect(res.html).not.toContain(">flaky<");
    });

    it("does not enforce visibility on the action route (UI hint only)", async () => {
      // The predicate hides the button, but the action route itself runs
      // the handler if invoked directly. Documented behavior.
      const calls: number[] = [];
      core = createTapemark({
        db,
        tables: {
          notes: {
            actions: {
              shouldnt_show: {
                label: "shouldn't show",
                handler: () => {
                  calls.push(1);
                  return { ok: true };
                },
                visible: () => false,
              },
            },
          },
        },
      });

      const res = await core.handle(
        req({
          method: "POST",
          path: "/notes/1/_action/shouldnt_show",
          params: { table: "notes", pk: "1", actionName: "shouldnt_show" },
        }),
      );
      expect(res.status).toBe(302);
      expect(calls).toEqual([1]);
    });
  });

  describe("inTable", () => {
    it("renders an actions column on the list when at least one action is inTable", async () => {
      core = createTapemark({
        db,
        tables: {
          notes: {
            actions: {
              quick: { label: "quick", handler: () => ({ ok: true }), inTable: true },
              detail_only: { label: "detail only", handler: () => ({ ok: true }) },
            },
          },
        },
      });

      const res = await core.handle(req({ path: "/notes", params: { table: "notes" } }));
      expect(res.status).toBe(200);
      expect(res.html).toContain('class="tm-row-action-col"');
      expect(res.html).toContain(">quick<");
      // detail_only must NOT render in the list (no inTable flag)
      expect(res.html).not.toContain(">detail only<");
    });

    it("does not render an actions column when no actions are inTable", async () => {
      core = createTapemark({
        db,
        tables: {
          notes: {
            actions: {
              detail_only: { label: "detail only", handler: () => ({ ok: true }) },
            },
          },
        },
      });

      const res = await core.handle(req({ path: "/notes", params: { table: "notes" } }));
      expect(res.html).not.toContain('class="tm-row-action-col"');
    });

    it("redirects back to the table list when invoked with _back=table", async () => {
      core = createTapemark({
        db,
        tables: {
          notes: {
            actions: {
              ping: {
                label: "ping",
                handler: () => ({ ok: true, message: "pong" }),
                inTable: true,
              },
            },
          },
        },
      });

      const res = await core.handle(
        req({
          method: "POST",
          path: "/notes/1/_action/ping",
          params: { table: "notes", pk: "1", actionName: "ping" },
          body: { _back: "table" },
        }),
      );
      expect(res.status).toBe(302);
      // No /:pk segment in the redirect — back to /notes
      expect(res.redirect).toBe("/notes?flash=success&msg=pong");
    });

    it("does not render in-table action buttons when the table is readonly", async () => {
      // Regression: list view used to keep showing buttons that the route
      // would then 403, exposing actions that couldn't succeed.
      core = createTapemark({
        db,
        tables: {
          notes: {
            readonly: true,
            actions: {
              ping: { label: "ping", inTable: true, handler: () => ({ ok: true }) },
            },
          },
        },
      });

      const res = await core.handle(req({ path: "/notes" }));
      expect(res.html).not.toContain('class="tm-row-action-col"');
      expect(res.html).not.toContain(">ping<");
    });

    it("still redirects to the row detail when no _back hint is given", async () => {
      core = createTapemark({
        db,
        tables: {
          notes: {
            actions: {
              ping: { label: "ping", handler: () => ({ ok: true }) },
            },
          },
        },
      });

      const res = await core.handle(
        req({
          method: "POST",
          path: "/notes/1/_action/ping",
          params: { table: "notes", pk: "1", actionName: "ping" },
        }),
      );
      expect(res.redirect).toContain("/notes/1?flash=success");
    });
  });
});
