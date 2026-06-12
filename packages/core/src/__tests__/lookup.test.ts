import { describe, it, expect, beforeEach } from "vitest";
import { createTapemark } from "../router";
import { createTestDb } from "../test-utils";
import type { Database, TapemarkRequest } from "../types";

const SCHEMA = `
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
  INSERT INTO users VALUES (1, 'Alice');
  INSERT INTO users VALUES (2, 'Bob');
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

describe("lookup route", () => {
  let db: Database;

  beforeEach(() => {
    ({ db } = createTestDb(SCHEMA));
  });

  it("auto label: returns 200 and matches on auto-picked label column", async () => {
    const core = createTapemark({ db });
    const res = await core.handle(
      makeReq({ path: "/users/_lookup", query: { q: "Al" } }),
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.html);
    expect(body.results.some((r: { label?: string }) => r.label === "Alice")).toBe(true);
  });

  it("explicit valid label: returns 200 when label param names a real column", async () => {
    const core = createTapemark({ db });
    const res = await core.handle(
      makeReq({ path: "/users/_lookup", query: { label: "name", q: "Al" } }),
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.html);
    expect(body.results.some((r: { label?: string }) => r.label === "Alice")).toBe(true);
  });

  it("invalid identifier: returns 404 for a label param containing illegal characters", async () => {
    const core = createTapemark({ db });
    const res = await core.handle(
      makeReq({ path: "/users/_lookup", query: { label: 'name" OR 1=1--' } }),
    );
    expect(res.status).toBe(404);
  });

  it("unknown column: returns 404 when label param names a non-existent column", async () => {
    const core = createTapemark({ db });
    const res = await core.handle(
      makeReq({ path: "/users/_lookup", query: { label: "not_a_column" } }),
    );
    expect(res.status).toBe(404);
  });
});
