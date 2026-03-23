import { describe, it, expect, beforeEach } from "vitest";
import { createAdminCore } from "../router";
import { createTestDb } from "../test-utils";
import type { Database, TapemarkRequest } from "../types";

const SCHEMA = `
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
`;

function makeReq(overrides: Partial<TapemarkRequest> = {}): TapemarkRequest {
  return {
    method: "GET",
    path: "/",
    query: {},
    ...overrides,
  };
}

describe("createAdminCore", () => {
  let db: Database;

  beforeEach(() => {
    ({ db } = createTestDb(SCHEMA));
  });

  it("returns 404 for unmatched routes", async () => {
    const core = createAdminCore({ db });
    const res = await core.handle(makeReq({ path: "/nonexistent" }));
    expect(res.status).toBe(404);
  });

  it("dispatches to registered route handlers", async () => {
    const core = createAdminCore({ db });
    core.addRoute("GET", "/", async () => ({
      status: 200,
      headers: { "content-type": "text/html" },
      html: "<h1>Home</h1>",
    }));

    const res = await core.handle(makeReq());
    expect(res.status).toBe(200);
    expect(res.html).toBe("<h1>Home</h1>");
  });

  it("matches parameterized routes", async () => {
    const core = createAdminCore({ db });
    core.addRoute("GET", "/:table", async (req) => ({
      status: 200,
      headers: {},
      html: `table=${req.query.table}`,
    }));

    const res = await core.handle(makeReq({ path: "/users" }));
    expect(res.status).toBe(200);
    expect(res.html).toBe("table=users");
  });

  it("matches nested parameterized routes", async () => {
    const core = createAdminCore({ db });
    core.addRoute("GET", "/:table/:pk", async (req) => ({
      status: 200,
      headers: {},
      html: `table=${req.query.table},pk=${req.query.pk}`,
    }));

    const res = await core.handle(makeReq({ path: "/users/42" }));
    expect(res.html).toBe("table=users,pk=42");
  });

  it("returns 403 when authorize rejects", async () => {
    const core = createAdminCore({
      db,
      authorize: async () => false,
    });
    core.addRoute("GET", "/", async () => ({
      status: 200,
      headers: {},
      html: "ok",
    }));

    const res = await core.handle(makeReq());
    expect(res.status).toBe(403);
  });

  it("proceeds when authorize allows", async () => {
    const core = createAdminCore({
      db,
      authorize: async () => true,
    });
    core.addRoute("GET", "/", async () => ({
      status: 200,
      headers: {},
      html: "ok",
    }));

    const res = await core.handle(makeReq());
    expect(res.status).toBe(200);
  });

  it("handles POST routes", async () => {
    const core = createAdminCore({ db });
    core.addRoute("POST", "/:table/new", async (req) => ({
      status: 201,
      headers: {},
      html: `created in ${req.query.table}`,
    }));

    const res = await core.handle(
      makeReq({ method: "POST", path: "/users/new" }),
    );
    expect(res.status).toBe(201);
    expect(res.html).toBe("created in users");
  });

  it("strips trailing slash for matching", async () => {
    const core = createAdminCore({ db });
    core.addRoute("GET", "/:table", async (req) => ({
      status: 200,
      headers: {},
      html: req.query.table!,
    }));

    const res = await core.handle(makeReq({ path: "/users/" }));
    expect(res.status).toBe(200);
    expect(res.html).toBe("users");
  });
});
