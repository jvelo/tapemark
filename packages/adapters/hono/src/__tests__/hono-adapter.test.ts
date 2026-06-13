/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import BetterSqlite3 from "better-sqlite3";
import { createSqliteAdapter } from "@jvelo/tapemark-better-sqlite3";
import { tapemark } from "../index";
import type { Database } from "@jvelo/tapemark";

const SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT
  );
  INSERT INTO users VALUES (1, 'Alice', 'alice@example.com');
  INSERT INTO users VALUES (2, 'Bob', 'bob@example.com');
`;

describe("Hono adapter", () => {
  let db: Database;
  let app: Hono;

  beforeEach(() => {
    const raw = new BetterSqlite3(":memory:");
    raw.exec(SCHEMA);
    db = createSqliteAdapter(raw);

    app = new Hono();
    app.route(
      "/admin",
      tapemark({
        db,
        prefix: "/admin",
      }),
    );
  });

  it("serves the table list at /admin/", async () => {
    const res = await app.request("/admin/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("users");
    expect(html).toContain("tapemark");
  });

  it("serves the rows page at /admin/:table", async () => {
    const res = await app.request("/admin/users");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
  });

  it("serves row detail at /admin/:table/:pk", async () => {
    const res = await app.request("/admin/users/1");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Alice");
    expect(html).toContain("alice@example.com");
  });

  it("serves CSS at /admin/_tapemark/styles.css", async () => {
    const res = await app.request("/admin/_tapemark/styles.css");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    const css = await res.text();
    expect(css).toContain(".tm");
  });

  it("serves JS at /admin/_tapemark/admin.js", async () => {
    const res = await app.request("/admin/_tapemark/admin.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });

  it("handles POST create and redirects", async () => {
    const form = new FormData();
    form.append("id", "3");
    form.append("name", "Carol");
    form.append("email", "carol@example.com");

    const res = await app.request("/admin/users/new", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/admin/users/3");
  });

  it("handles POST update and redirects", async () => {
    const form = new FormData();
    form.append("name", "Alicia");
    form.append("email", "alicia@new.com");

    const res = await app.request("/admin/users/1", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(302);

    // Verify the update
    const detail = await app.request("/admin/users/1");
    const html = await detail.text();
    expect(html).toContain("Alicia");
  });

  it("handles POST delete and redirects", async () => {
    const res = await app.request("/admin/users/2/delete", {
      method: "POST",
    });
    expect(res.status).toBe(302);

    const list = await app.request("/admin/users");
    const html = await list.text();
    expect(html).not.toContain("Bob");
  });

  it("returns 403 when authorize rejects", async () => {
    const restrictedApp = new Hono();
    restrictedApp.route(
      "/admin",
      tapemark({
        db,
        prefix: "/admin",
        authorize: async () => false,
      }),
    );

    const res = await restrictedApp.request("/admin/");
    expect(res.status).toBe(403);
  });

  it("uses the Response returned by authorize as the denial", async () => {
    const redirectApp = new Hono();
    redirectApp.route(
      "/admin",
      tapemark({
        db,
        prefix: "/admin",
        authorize: async (c) => c.redirect("/login?redirect=%2Fadmin%2F"),
      }),
    );

    const res = await redirectApp.request("/admin/");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?redirect=%2Fadmin%2F");
  });

  it("allows access when authorize passes", async () => {
    const authApp = new Hono();
    authApp.route(
      "/admin",
      tapemark({
        db,
        prefix: "/admin",
        authorize: async () => true,
      }),
    );

    const res = await authApp.request("/admin/");
    expect(res.status).toBe(200);
  });

  it("works with db as function (D1 pattern)", async () => {
    const fnApp = new Hono();
    fnApp.route(
      "/admin",
      tapemark({
        db: () => db,
        prefix: "/admin",
      }),
    );

    const res = await fnApp.request("/admin/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("users");
  });

  it("isolates concurrent requests with different databases", async () => {
    const rawA = new BetterSqlite3(":memory:");
    rawA.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT); INSERT INTO items VALUES (1, 'from-db-a');");
    const dbA = createSqliteAdapter(rawA);

    const rawB = new BetterSqlite3(":memory:");
    rawB.exec("CREATE TABLE things (id INTEGER PRIMARY KEY, label TEXT); INSERT INTO things VALUES (1, 'from-db-b');");
    const dbB = createSqliteAdapter(rawB);

    // Both requests go through the same tapemark() instance, but
    // should each see their own database via the per-request factory.
    let callCount = 0;
    const concurrentApp = new Hono();
    concurrentApp.route(
      "/admin",
      tapemark({
        db: () => {
          callCount++;
          return callCount % 2 === 1 ? dbA : dbB;
        },
        prefix: "/admin",
      }),
    );

    const [resA, resB] = await Promise.all([
      concurrentApp.request("/admin/"),
      concurrentApp.request("/admin/"),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const htmlA = await resA.text();
    const htmlB = await resB.text();

    // Each response should reflect its own database's tables
    const hasItems = htmlA.includes("items") || htmlB.includes("items");
    const hasThings = htmlA.includes("things") || htmlB.includes("things");
    expect(hasItems).toBe(true);
    expect(hasThings).toBe(true);
  });
});
