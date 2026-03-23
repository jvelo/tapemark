import { describe, it, expect, beforeEach } from "vitest";
import { createAdminCore } from "../router";
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
    core = createAdminCore({ db, prefix: "/admin" });
  });

  describe("tables list", () => {
    it("GET / returns table list", async () => {
      const res = await core.handle(req());
      expect(res.status).toBe(200);
      expect(res.html).toContain("users");
      expect(res.html).toContain("posts");
    });

    it("respects hidden table option", async () => {
      core = createAdminCore({
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
      core = createAdminCore({
        db,
        authorize: async () => false,
      });
      const res = await core.handle(req());
      expect(res.status).toBe(403);
    });
  });

  describe("readonly tables", () => {
    it("hides new row and delete buttons for readonly tables", async () => {
      core = createAdminCore({
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
