import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../../..");

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("no port"))));
    });
    srv.on("error", reject);
  });
}

async function waitForServer(base: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(base + "/");
      if (res.status > 0) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server at ${base} did not start`);
}

function startServer(port: number, dbPaths: string[]): ChildProcess {
  const cliEntry = join(ROOT, "packages/cli/src/index.ts");
  return spawn(
    "npx",
    ["tsx", cliEntry, "serve", ...dbPaths, "--port", String(port)],
    { cwd: ROOT, stdio: "ignore" },
  );
}

const TS = Date.now();

describe("serve (single DB)", () => {
  const DB = join(tmpdir(), `tapemark-serve-single-${TS}.db`);
  let port: number;
  let base: string;
  let child: ChildProcess;

  beforeAll(async () => {
    const raw = new BetterSqlite3(DB);
    raw.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO users VALUES (1, 'Alice');
    `);
    raw.close();

    port = await getFreePort();
    base = `http://localhost:${port}`;
    child = startServer(port, [DB]);
    await waitForServer(base);
  }, 30000);

  afterAll(() => {
    child.kill();
    try { unlinkSync(DB); } catch {}
  });

  it("GET / returns 200 and lists the users table", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("users");
  });

  it("GET /users returns 200 and contains Alice", async () => {
    const res = await fetch(`${base}/users`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Alice");
  });

  it("GET /does-not-exist returns 404", async () => {
    const res = await fetch(`${base}/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it("POST /users/new creates a row and GET /users shows Bob", async () => {
    const res = await fetch(`${base}/users/new`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ name: "Bob" }).toString(),
      redirect: "manual",
    });
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);

    const listRes = await fetch(`${base}/users`);
    expect(listRes.status).toBe(200);
    const body = await listRes.text();
    expect(body).toContain("Bob");
  });
});

describe("serve (multi DB)", () => {
  const DBA = join(tmpdir(), `tapemark-serve-alpha-${TS}.db`);
  const DBB = join(tmpdir(), `tapemark-serve-beta-${TS}.db`);
  // Expected URL prefixes derived from basenames (strip .db, keep alphanumeric/_/-)
  const prefixA = `tapemark-serve-alpha-${TS}`;
  const prefixB = `tapemark-serve-beta-${TS}`;
  let port: number;
  let base: string;
  let child: ChildProcess;

  beforeAll(async () => {
    const rawA = new BetterSqlite3(DBA);
    rawA.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO users VALUES (1, 'Alice');
    `);
    rawA.close();

    const rawB = new BetterSqlite3(DBB);
    rawB.exec(`
      CREATE TABLE tags (id INTEGER PRIMARY KEY, label TEXT NOT NULL);
      INSERT INTO tags VALUES (1, 'typescript');
    `);
    rawB.close();

    port = await getFreePort();
    base = `http://localhost:${port}`;
    child = startServer(port, [DBA, DBB]);
    await waitForServer(base);
  }, 30000);

  afterAll(() => {
    child.kill();
    try { unlinkSync(DBA); } catch {}
    try { unlinkSync(DBB); } catch {}
  });

  it("GET / lists both database names", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(prefixA);
    expect(body).toContain(prefixB);
  });

  it("GET /<alpha>/users returns 200 with a users row", async () => {
    const res = await fetch(`${base}/${prefixA}/users`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Alice");
  });

  it("GET /<unknown-db>/whatever returns 404 with Not Found", async () => {
    const res = await fetch(`${base}/no-such-db/whatever`);
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain("Not Found");
  });

  it("GET /_tapemark/styles.css returns 200 with text/css", async () => {
    const res = await fetch(`${base}/_tapemark/styles.css`);
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct).toContain("text/css");
  });
});
