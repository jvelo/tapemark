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
import type { Database, TapemarkRequest } from "../types";
import type { TapemarkCore } from "../router";

const SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT
  );
  INSERT INTO users VALUES (1, 'Alice', 'alice@example.com');
  INSERT INTO users VALUES (2, 'Bob', 'bob@example.com');
  INSERT INTO users VALUES (3, 'Carol', NULL);

  CREATE TABLE posts (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT,
    user_id INTEGER
  );
  INSERT INTO posts VALUES (1, 'Hello World', 'First post', 1);
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

describe("Integration: full request lifecycle", () => {
  let db: Database;
  let core: TapemarkCore;

  beforeEach(() => {
    ({ db } = createTestDb(SCHEMA));
    core = createTapemark({ db, prefix: "/admin" });
  });

  describe("tables list", () => {
    it("GET / returns table list", async () => {
      const res = await core.handle(req());
      expect(res.status).toBe(200);
      expect(res.html).toContain("users");
      expect(res.html).toContain("posts");
    });

    it("respects hidden table option", async () => {
      core = createTapemark({
        db,
        prefix: "/admin",
        tables: { posts: { hidden: true } },
      });
      const res = await core.handle(req());
      expect(res.status).toBe(200);
      expect(res.html).toContain("users");
      expect(res.html).not.toContain(">posts<");
    });
  });

  describe("rows browser", () => {
    it("GET /:table shows rows", async () => {
      const res = await core.handle(req({ path: "/users" }));
      expect(res.status).toBe(200);
      expect(res.html).toContain("Alice");
      expect(res.html).toContain("Bob");
      expect(res.html).toContain("Carol");
    });

    it("shows flash messages from query params", async () => {
      const res = await core.handle(
        req({ path: "/users", query: { flash: "success", msg: "done" } }),
      );
      expect(res.status).toBe(200);
      expect(res.html).toContain("done");
    });
  });

  describe("row detail", () => {
    it("GET /:table/:pk shows row form", async () => {
      const res = await core.handle(req({ path: "/users/1" }));
      expect(res.status).toBe(200);
      expect(res.html).toContain("Alice");
      expect(res.html).toContain("alice@example.com");
      expect(res.html).toContain("edit row");
    });

    it("returns 404 for missing row", async () => {
      const res = await core.handle(req({ path: "/users/999" }));
      expect(res.status).toBe(404);
    });
  });

  describe("row create", () => {
    it("GET /:table/new shows create form", async () => {
      const res = await core.handle(req({ path: "/users/new" }));
      expect(res.status).toBe(200);
      expect(res.html).toContain("new row");
      expect(res.html).toContain("create");
    });

    it("POST /:table/new inserts and redirects", async () => {
      const res = await core.handle(
        req({
          method: "POST",
          path: "/users/new",
          body: { id: "4", name: "Dave", email: "dave@example.com" },
        }),
      );
      expect(res.status).toBe(302);
      expect(res.redirect).toContain("/admin/users/4");

      // Verify row was created
      const detail = await core.handle(req({ path: "/users/4" }));
      expect(detail.html).toContain("Dave");
    });
  });

  describe("row update", () => {
    it("POST /:table/:pk updates and redirects", async () => {
      const res = await core.handle(
        req({
          method: "POST",
          path: "/users/1",
          body: { name: "Alicia", email: "alicia@example.com" },
        }),
      );
      expect(res.status).toBe(302);
      expect(res.redirect).toContain("row%20updated");

      const detail = await core.handle(req({ path: "/users/1" }));
      expect(detail.html).toContain("Alicia");
    });
  });

  describe("row delete", () => {
    it("POST /:table/:pk/delete removes and redirects", async () => {
      const res = await core.handle(
        req({ method: "POST", path: "/users/3/delete" }),
      );
      expect(res.status).toBe(302);
      expect(res.redirect).toContain("row%20deleted");

      const list = await core.handle(req({ path: "/users" }));
      expect(list.html).not.toContain("Carol");
    });
  });

  describe("bulk delete", () => {
    it("POST /:table/_bulk-delete removes multiple rows", async () => {
      const res = await core.handle(
        req({
          method: "POST",
          path: "/users/_bulk-delete",
          body: { pk: ["1", "3"], page: "1" },
        }),
      );
      expect(res.status).toBe(302);
      expect(res.redirect).toContain("2%20rows%20deleted");

      const list = await core.handle(req({ path: "/users" }));
      expect(list.html).toContain("Bob");
      expect(list.html).not.toContain("Alice");
      expect(list.html).not.toContain("Carol");
    });
  });

  describe("PKs containing URL-special characters", () => {
    // Regression: when a row's primary key contains ':' or '/' (e.g. a URL as
    // the PK), the row-detail form actions used to interpolate the decoded
    // pkParam straight into the action URL, producing paths like
    // `/cache/https://example.com` that 404 on submit.
    const URL_SCHEMA = `
      CREATE TABLE cache (
        url TEXT PRIMARY KEY,
        title TEXT
      );
      INSERT INTO cache VALUES ('https://example.com', 'Example');
    `;
    const ENCODED = encodeURIComponent("https://example.com");

    beforeEach(() => {
      ({ db } = createTestDb(URL_SCHEMA));
      core = createTapemark({ db, prefix: "/admin" });
    });

    it("renders form actions with the pk encoded for the URL path", async () => {
      const res = await core.handle(req({ path: `/cache/${ENCODED}` }));
      expect(res.status).toBe(200);
      expect(res.html).toContain(`action="/admin/cache/${ENCODED}"`);
      expect(res.html).toContain(`action="/admin/cache/${ENCODED}/delete"`);
      expect(res.html).not.toContain("/admin/cache/https://example.com");
    });

    it("POST updates and redirects with the pk re-encoded", async () => {
      const res = await core.handle(
        req({
          method: "POST",
          path: `/cache/${ENCODED}`,
          body: { title: "Updated" },
        }),
      );
      expect(res.status).toBe(302);
      expect(res.redirect).toContain(`/admin/cache/${ENCODED}`);
      expect(res.redirect).not.toContain("/admin/cache/https://example.com");
    });

    it("POST delete redirects to the table list (no pk in path)", async () => {
      const res = await core.handle(
        req({ method: "POST", path: `/cache/${ENCODED}/delete` }),
      );
      expect(res.status).toBe(302);
      expect(res.redirect).toContain("/admin/cache?");
    });
  });

  describe("table config", () => {
    it("GET /:table/_config shows config form", async () => {
      const res = await core.handle(req({ path: "/users/_config" }));
      expect(res.status).toBe(200);
      expect(res.html).toContain("display config");
      expect(res.html).toContain("name");
      expect(res.html).toContain("email");
    });

    it("POST /:table/_config saves and redirects", async () => {
      const res = await core.handle(
        req({
          method: "POST",
          path: "/users/_config",
          body: {
            id__display: "text",
            id__label: "",
            id__hidden: "",
            name__display: "text",
            name__label: "Full Name",
            name__hidden: "",
            email__display: "link",
            email__label: "",
            email__hidden: "",
          },
        }),
      );
      expect(res.status).toBe(302);
      expect(res.redirect).toContain("config%20saved");
    });
  });

  describe("assets", () => {
    it("serves CSS at /_tapemark/styles.css", async () => {
      const res = await core.handle(
        req({ path: "/_tapemark/styles.css" }),
      );
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/css");
      expect(res.html).toContain(".tm");
    });

    it("serves JS at /_tapemark/admin.js", async () => {
      const res = await core.handle(
        req({ path: "/_tapemark/admin.js" }),
      );
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("javascript");
      expect(res.html).toContain("tm-confirm-button");
    });
  });

  describe("auth", () => {
    it("returns 403 when authorize rejects", async () => {
      core = createTapemark({
        db,
        authorize: async () => false,
      });
      const res = await core.handle(req());
      expect(res.status).toBe(403);
    });
  });

  describe("create form: auto-generated PK", () => {
    it("hides INTEGER PRIMARY KEY field on create form", async () => {
      const res = await core.handle(req({ path: "/users/new" }));
      expect(res.status).toBe(200);
      // The PK column should not appear as an editable input
      expect(res.html).not.toContain('name="id"');
    });

    it("shows the PK field on edit form (read-only)", async () => {
      const res = await core.handle(req({ path: "/users/1" }));
      expect(res.status).toBe(200);
      // PK is rendered with a value but disabled — name attribute is omitted
      expect(res.html).toContain("disabled");
    });

    it("admins can opt back in via showOnCreate column config", async () => {
      // Save config that flips showOnCreate for the id column
      await core.handle(
        req({
          method: "POST",
          path: "/users/_config",
          body: {
            id__display: "text",
            id__label: "",
            id__hidden: "",
            id__showOnCreate: "1",
            name__display: "text",
            name__label: "",
            name__hidden: "",
            email__display: "text",
            email__label: "",
            email__hidden: "",
          },
        }),
      );

      const res = await core.handle(req({ path: "/users/new" }));
      expect(res.html).toContain('name="id"');
    });

    it("does not hide INTEGER PRIMARY KEY on WITHOUT ROWID tables", async () => {
      // The rowid alias is disabled on WITHOUT ROWID, so the integer PK is
      // a regular column the user must supply. Hiding it would block inserts.
      const schema = `
        CREATE TABLE catalog (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        ) WITHOUT ROWID;
      `;
      const { db: cdb } = createTestDb(schema);
      const ccore = createTapemark({ db: cdb });
      const res = await ccore.handle(
        req({ path: "/catalog/new", params: { table: "catalog" } }),
      );
      expect(res.html).toContain('name="id"');
    });

    it("never hides composite PKs (only single-column INTEGER auto-PK)", async () => {
      // posts has a single INTEGER PK — covered above. Build a fresh DB
      // with a composite PK to verify it's still rendered on create.
      const compositeSchema = `
        CREATE TABLE memberships (
          user_id INTEGER NOT NULL,
          group_id INTEGER NOT NULL,
          role TEXT,
          PRIMARY KEY (user_id, group_id)
        );
      `;
      const { db: cdb } = createTestDb(compositeSchema);
      const ccore = createTapemark({ db: cdb });
      const res = await ccore.handle(
        req({ path: "/memberships/new", params: { table: "memberships" } }),
      );
      expect(res.html).toContain('name="user_id"');
      expect(res.html).toContain('name="group_id"');
    });
  });

  describe("create form: required attribute", () => {
    it("does not mark NOT NULL columns as required when they have a DEFAULT", async () => {
      const schema = `
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'todo'
        );
      `;
      const { db: tdb } = createTestDb(schema);
      const tcore = createTapemark({ db: tdb });
      const res = await tcore.handle(
        req({ path: "/tasks/new", params: { table: "tasks" } }),
      );

      // title is required (NOT NULL, no default)
      expect(res.html).toMatch(/name="title"[^>]*required/);
      // status has a default → not required
      expect(res.html).not.toMatch(/name="status"[^>]*required/);
    });

    it("submitting without a defaulted column lets SQLite fill in the default", async () => {
      const schema = `
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'todo'
        );
      `;
      const { db: tdb } = createTestDb(schema);
      const tcore = createTapemark({ db: tdb });

      const res = await tcore.handle(
        req({
          method: "POST",
          path: "/tasks/new",
          params: { table: "tasks" },
          body: { title: "no status given" },
        }),
      );
      expect(res.status).toBe(302);

      const detail = await tcore.handle(
        req({ path: "/tasks/1", params: { table: "tasks", pk: "1" } }),
      );
      expect(detail.html).toContain("todo");
    });
  });

  describe("readonly tables", () => {
    it("hides new row and delete buttons for readonly tables", async () => {
      core = createTapemark({
        db,
        prefix: "/admin",
        tables: { users: { readonly: true } },
      });

      const rows = await core.handle(req({ path: "/users" }));
      expect(rows.html).not.toContain("+ new row");
      expect(rows.html).not.toContain("delete selected");

      const detail = await core.handle(req({ path: "/users/1" }));
      expect(detail.html).toContain("view row");
      expect(detail.html).not.toContain("delete row");
    });
  });

  describe("HTML structure", () => {
    it("includes doctype and html tags", async () => {
      const res = await core.handle(req());
      expect(res.html).toMatch(/^<!DOCTYPE html>/);
      expect(res.html).toContain("<html");
      expect(res.html).toContain("</html>");
    });

    it("includes CSS and JS links", async () => {
      const res = await core.handle(req());
      expect(res.html).toContain("/_tapemark/styles.css");
      expect(res.html).toContain("/_tapemark/admin.js");
    });

    it("uses tapemark in title", async () => {
      const res = await core.handle(req());
      expect(res.html).toContain("tapemark");
    });
  });
});
