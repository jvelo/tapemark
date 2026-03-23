import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import BetterSqlite3 from "better-sqlite3";
import { createSqliteAdapter } from "@jvelo/tapemark-better-sqlite3";
import { createAdmin } from "../index";
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
      createAdmin({
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
      createAdmin({
        db,
        prefix: "/admin",
        authorize: async () => false,
      }),
    );

    const res = await restrictedApp.request("/admin/");
    expect(res.status).toBe(403);
  });

  it("allows access when authorize passes", async () => {
    const authApp = new Hono();
    authApp.route(
      "/admin",
      createAdmin({
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
      createAdmin({
        db: () => db,
        prefix: "/admin",
      }),
    );

    const res = await fnApp.request("/admin/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("users");
  });
});
