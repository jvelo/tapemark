import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import BetterSqlite3 from "better-sqlite3";

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../../..");
const CLI = `npx tsx ${join(ROOT, "packages/cli/src/index.ts")}`;
const DB1 = join(tmpdir(), `tapemark-test-${Date.now()}-1.db`);
const DB2 = join(tmpdir(), `tapemark-test-${Date.now()}-2.db`);

beforeAll(() => {
  const raw1 = new BetterSqlite3(DB1);
  raw1.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT);
    INSERT INTO users VALUES (1, 'Alice', 'alice@example.com');
    INSERT INTO users VALUES (2, 'Bob', NULL);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT, body TEXT);
    INSERT INTO posts VALUES (1, 'Hello', 'World');
  `);
  raw1.close();

  const raw2 = new BetterSqlite3(DB2);
  raw2.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER);
    CREATE TABLE tags (id INTEGER PRIMARY KEY, label TEXT);
  `);
  raw2.close();
});

afterAll(() => {
  try { unlinkSync(DB1); } catch {}
  try { unlinkSync(DB2); } catch {}
});

function run(args: string): string {
  return execSync(`${CLI} ${args}`, {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 10000,
  });
}

describe("tapemark inspect", () => {
  it("lists tables with row counts", () => {
    const output = run(`inspect ${DB1}`);
    expect(output).toContain("users");
    expect(output).toContain("posts");
    expect(output).toContain("2 tables");
  });

  it("shows schema for a specific table", () => {
    const output = run(`inspect ${DB1} --table users`);
    expect(output).toContain("users (2 rows)");
    expect(output).toContain("id");
    expect(output).toContain("name");
    expect(output).toContain("email");
    expect(output).toContain("INTEGER");
    expect(output).toContain("TEXT");
    expect(output).toContain("PK(1)");
    expect(output).toContain("NOT NULL");
  });

  it("compares schemas with --diff", () => {
    const output = run(`inspect ${DB1} --diff ${DB2}`);
    expect(output).toContain("Schemas differ");
    expect(output).toContain("posts (only in source)");
    expect(output).toContain("tags (only in target)");
    expect(output).toContain("email (only in source)");
    expect(output).toContain("age (only in target)");
  });

  it("reports identical schemas", () => {
    const output = run(`inspect ${DB1} --diff ${DB1}`);
    expect(output).toContain("identical");
  });

  it("errors on non-existent file", () => {
    expect(() => run("inspect /tmp/nonexistent-12345.db")).toThrow();
  });
});
