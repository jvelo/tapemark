import { describe, it, expect, beforeEach } from "vitest";
import { createTapemark } from "../router";
import { createTestDb } from "../test-utils";
import type { Database, TapemarkRequest } from "../types";

const SCHEMA = `
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
  INSERT INTO users VALUES (1, 'Alice');
`;

function makeReq(overrides: Partial<TapemarkRequest> = {}): TapemarkRequest {
  return {
    method: "GET",
    path: "/",
    params: {},
    query: {},
    ...overrides,
  };
}

describe("createTapemark", () => {
  let db: Database;

  beforeEach(() => {
    ({ db } = createTestDb(SCHEMA));
  });

  it("returns 404 for unmatched routes", async () => {
    const core = createTapemark({ db });
    // /_tapemark/nonexistent doesn't match any route pattern
    const res = await core.handle(makeReq({ path: "/_tapemark/nonexistent/extra" }));
    expect(res.status).toBe(404);
  });

  it("dispatches built-in table list route at /", async () => {
    const core = createTapemark({ db });
    const res = await core.handle(makeReq());
    expect(res.status).toBe(200);
    expect(res.html).toContain("users");
  });

  it("dispatches parameterized route /:table", async () => {
    const core = createTapemark({ db });
    const res = await core.handle(makeReq({ path: "/users" }));
    expect(res.status).toBe(200);
    expect(res.html).toContain("Alice");
  });

  it("dispatches nested parameterized route /:table/:pk", async () => {
    const core = createTapemark({ db });
    const res = await core.handle(makeReq({ path: "/users/1" }));
    expect(res.status).toBe(200);
    expect(res.html).toContain("Alice");
  });

  it("returns 403 when authorize rejects", async () => {
    const core = createTapemark({
      db,
      authorize: async () => false,
    });
    const res = await core.handle(makeReq());
    expect(res.status).toBe(403);
  });

  it("proceeds when authorize allows", async () => {
    const core = createTapemark({
      db,
      authorize: async () => true,
    });
    const res = await core.handle(makeReq());
    expect(res.status).toBe(200);
  });

  it("handles POST /:table/new", async () => {
    const core = createTapemark({ db });
    const res = await core.handle(
      makeReq({
        method: "POST",
        path: "/users/new",
        body: { id: "2", name: "Bob" },
      }),
    );
    expect(res.status).toBe(302);
    expect(res.redirect).toContain("/users/2");
  });

  it("strips trailing slash for matching", async () => {
    const core = createTapemark({ db });
    const res = await core.handle(makeReq({ path: "/users/" }));
    expect(res.status).toBe(200);
    expect(res.html).toContain("Alice");
  });

  describe("styled error pages", () => {
    it("renders 404 with layout and error styling", async () => {
      const core = createTapemark({ db });
      const res = await core.handle(makeReq({ path: "/_tapemark/nonexistent/extra" }));
      expect(res.status).toBe(404);
      expect(res.html).toContain("tm-error");
      expect(res.html).toContain("404");
      expect(res.html).toContain("Not Found");
      expect(res.html).toContain("tm-bar");
      expect(res.html).toContain("styles.css");
    });

    it("renders 403 with layout and error styling", async () => {
      const core = createTapemark({
        db,
        authorize: async () => false,
      });
      const res = await core.handle(makeReq());
      expect(res.status).toBe(403);
      expect(res.html).toContain("tm-error");
      expect(res.html).toContain("403");
      expect(res.html).toContain("Forbidden");
      expect(res.html).toContain("tm-bar");
    });

    it("renders TapemarkError with layout and error message", async () => {
      const core = createTapemark({ db });
      const res = await core.handle(makeReq({ path: "/nonexistent_table" }));
      expect(res.status).toBe(404);
      expect(res.html).toContain("tm-error");
      expect(res.html).toContain("tm-bar");
    });

    it("includes back-to-tables link in error pages", async () => {
      const core = createTapemark({ db });
      const res = await core.handle(makeReq({ path: "/_tapemark/nonexistent/extra" }));
      expect(res.html).toContain("back to tables");
    });

    it("respects custom name in error pages", async () => {
      const core = createTapemark({ db, name: "my-admin" });
      const res = await core.handle(makeReq({ path: "/_tapemark/nonexistent/extra" }));
      expect(res.html).toContain("my-admin");
    });

    it("respects prefix in error page links", async () => {
      const core = createTapemark({ db, prefix: "/admin" });
      const res = await core.handle(makeReq({ path: "/_tapemark/nonexistent/extra" }));
      expect(res.html).toContain('href="/admin"');
    });
  });

  it("serves assets at /_tapemark/* paths", async () => {
    const core = createTapemark({ db });
    const css = await core.handle(makeReq({ path: "/_tapemark/styles.css" }));
    expect(css.status).toBe(200);
    expect(css.headers["content-type"]).toContain("text/css");

    const js = await core.handle(makeReq({ path: "/_tapemark/admin.js" }));
    expect(js.status).toBe(200);
    expect(js.headers["content-type"]).toContain("javascript");
  });
});
