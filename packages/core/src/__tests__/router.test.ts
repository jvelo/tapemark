/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTapemark } from "../router";
import { encodePk } from "../repository";
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

  it("uses the TapemarkResponse returned by authorize as the denial", async () => {
    const core = createTapemark({
      db,
      authorize: async () => ({
        status: 302,
        headers: {},
        redirect: "/login",
      }),
    });
    const res = await core.handle(makeReq());
    expect(res.status).toBe(302);
    expect(res.redirect).toBe("/login");
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

  describe("hidden tables", () => {
    it("returns 404 for GET /:table when the table is hidden", async () => {
      const core = createTapemark({ db, tables: { users: { hidden: true } } });
      const res = await core.handle(makeReq({ path: "/users" }));
      expect(res.status).toBe(404);
    });

    it("returns 404 for GET /:table/_lookup when the table is hidden", async () => {
      const core = createTapemark({ db, tables: { users: { hidden: true } } });
      const res = await core.handle(makeReq({ path: "/users/_lookup", query: { q: "a" } }));
      expect(res.status).toBe(404);
    });

    it("returns 404 for POST /:table/:pk when the table is hidden", async () => {
      const core = createTapemark({ db, tables: { users: { hidden: true } } });
      const res = await core.handle(makeReq({ method: "POST", path: "/users/1", body: { name: "x" } }));
      expect(res.status).toBe(404);
    });

    it("returns 200 for GET /:table when the table is not hidden", async () => {
      const core = createTapemark({ db });
      const res = await core.handle(makeReq({ path: "/users" }));
      expect(res.status).toBe(200);
    });
  });
});

// `encodePk` percent-encodes each PK part; the router must round-trip a value
// containing `/`, `,`, or `%` back via `decodePk`, not a mangled one.
describe("router: primary keys with URL-special characters", () => {
  const PK_SCHEMA = `
    CREATE TABLE author (id TEXT PRIMARY KEY, name TEXT);
    INSERT INTO author VALUES ('person/1', 'Slashed');
    INSERT INTO author VALUES ('a', 'JustA');
    INSERT INTO author VALUES ('a,b', 'Comma');
    INSERT INTO author VALUES ('a%b', 'Percent');

    CREATE TABLE membership (org TEXT, member TEXT, role TEXT, PRIMARY KEY (org, member));
    INSERT INTO membership VALUES ('acme', 'x', 'guest');
    INSERT INTO membership VALUES ('acme', 'x,y', 'admin');
  `;

  let db: Database;
  beforeEach(() => {
    ({ db } = createTestDb(PK_SCHEMA));
  });

  function detail(table: string, pk: Record<string, string>) {
    const core = createTapemark({ db });
    return core.handle(makeReq({ path: `/${table}/${encodePk(Object.keys(pk), pk)}` }));
  }

  it("round-trips a value containing a slash", async () => {
    const res = await detail("author", { id: "person/1" });
    expect(res.status).toBe(200);
    expect(res.html).toContain("Slashed");
  });

  it("round-trips a value containing a comma without collapsing to the first part", async () => {
    const res = await detail("author", { id: "a,b" });
    expect(res.status).toBe(200);
    expect(res.html).toContain("Comma");
    // a naive split-on-comma would resolve { id: "a" } → the wrong row
    expect(res.html).not.toContain("JustA");
  });

  it("round-trips a value containing a percent sign", async () => {
    const res = await detail("author", { id: "a%b" });
    expect(res.status).toBe(200);
    expect(res.html).toContain("Percent");
  });

  it("round-trips a composite PK whose value contains the separator char", async () => {
    const res = await detail("membership", { org: "acme", member: "x,y" });
    expect(res.status).toBe(200);
    expect(res.html).toContain("admin");
    // must not collapse member "x,y" into the separate-row member "x"
    expect(res.html).not.toContain("guest");
  });
});
