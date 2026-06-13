# Plan 004: Add HTTP-level tests for the CLI `serve` server

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat b61671a..HEAD -- packages/cli/src/serve.ts packages/cli/src/index.ts packages/cli/src/__tests__/inspect.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (but should land **before** plan 005, which refactors the
  code these tests cover — these are the characterization net for that refactor)
- **Category**: tests
- **Planned at**: commit `b61671a`, 2026-06-12

## Why this matters

The CLI's `serve` command is the project's flagship entry point
(`npx tapemark serve x.db`), but it has **zero tests**. The only CLI test file,
`packages/cli/src/__tests__/inspect.test.ts`, covers the `inspect` command only.
Untested in `serve.ts`: multi-database routing by path prefix, the
`/_tapemark/` asset short-circuit, form-body parsing for POST mutations, the
single-vs-multi-DB branch, and the 404/500 paths. A regression in
request-to-core translation or form parsing would ship silently. These
black-box HTTP tests pin the server's observable behavior so it can be
refactored safely (plan 005).

## Current state

`packages/cli/src/serve.ts` defines a `citty` command whose `run` opens the
SQLite files, then starts a Node `http` server. The observable behaviors to pin
(all from reading `serve.ts:99-196`):

- **Single DB** (`databases.length === 1`): every request is forwarded to
  `databases[0].core.handle({ method, path, params:{}, query, body })` and the
  core response is written out (`serve.ts:165-176`).
- **Multi DB**: `GET /` renders a database list page
  (`renderDatabaseListPage`, `serve.ts:119-127`); `/_tapemark/*` is served from
  `databases[0]` (`serve.ts:130-140`); otherwise the first path segment selects
  the DB and is stripped before forwarding (`serve.ts:142-164`); unknown DB
  prefix → `404` with body `<h1>Not Found</h1>` (`serve.ts:146-150`).
- **POST bodies** are parsed by `parseFormBody` (`serve.ts:236-258`) — URL-encoded
  form data into `Record<string, string | string[]>`.
- **Errors**: the whole handler is wrapped in try/catch → `500` + `text/plain`
  body `Internal Server Error` (`serve.ts:177-181`).
- **Redirects**: `sendResponse` writes the `location` header when the core
  returns `redirect` (`serve.ts:220-234`).

The CLI is invoked in tests as a child process. The existing pattern,
`packages/cli/src/__tests__/inspect.test.ts:1-45`:

```ts
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../../..");
const CLI = `npx tsx ${join(ROOT, "packages/cli/src/index.ts")}`;
const DB1 = join(tmpdir(), `tapemark-test-${Date.now()}-1.db`);
// beforeAll: new BetterSqlite3(DB1).exec(`CREATE TABLE users ...`)
```

`inspect` is a one-shot command (`execSync`), but `serve` is **long-running**, so
these tests must `spawn` the server, poll until it's ready, make HTTP requests
with the global `fetch` (Node ≥20, and `package.json` engines requires `>=20`),
then kill the child in `afterAll`.

Server arguments: `serve <db> [<db2> ...] --port <port>` (see the `args` block at
`serve.ts:21-47`). On startup it logs `http://localhost:<port>` to stdout
(`serve.ts:193`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| CLI tests (all) | `pnpm --filter @jvelo/tapemark-cli test` | all pass |
| Single test file | `pnpm --filter @jvelo/tapemark-cli exec vitest run src/__tests__/serve.test.ts` | new file passes |
| Lint | `pnpm run lint` | exit 0 |

## Scope

**In scope** (create):
- `packages/cli/src/__tests__/serve.test.ts`

**Out of scope** (do NOT touch):
- `packages/cli/src/serve.ts` — these are characterization tests of current
  behavior; do not change the server in this plan. (If you find a bug, note it for
  plan 005, do not fix it here.)
- The two `examples/*/serve.ts` servers.
- Any core package files.

## Git workflow

- Branch: `advisor/004-cli-serve-http-tests`
- Plain imperative commit subject, e.g. `Add HTTP tests for the serve command`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Scaffold the test file with spawn + readiness helpers

Create `packages/cli/src/__tests__/serve.test.ts`. Reuse the constants pattern
from `inspect.test.ts` (`ROOT`, temp DB paths via `tmpdir()` + `Date.now()`).
Add two helpers:

```ts
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";

// Ask the OS for a free TCP port (avoids hard-coding / collisions).
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

// Poll until the server answers, or throw after ~8s.
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
```

Use `beforeAll` to create the temp DB(s) (mirror `inspect.test.ts`'s
`new BetterSqlite3(path).exec(...)` then `.close()`), get a free port, start the
server, and `await waitForServer(...)`. Use `afterAll` to `child.kill()` and
`unlinkSync` the temp DBs.

**Verify**: `pnpm --filter @jvelo/tapemark-cli exec vitest run src/__tests__/serve.test.ts`
→ the suite at least starts and the `beforeAll` does not time out (even with zero
`it` blocks yet, or one trivial `it` asserting the server responded).

### Step 2: Single-DB behavior tests

In a `describe("serve (single DB)")` with its own server on its own free port,
seed a DB like:

```sql
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
INSERT INTO users VALUES (1, 'Alice');
```

Assertions (use `fetch`, read `await res.text()`):

1. `GET /` → `status 200`, body contains `users`.
2. `GET /users` → `status 200`, body contains `Alice`.
3. `GET /does-not-exist-table` → `status` is `404` (the core returns a
   `NameValidationError` 404 for an unknown table).
4. **POST round-trip**: POST to `/users/new` with a urlencoded body
   (`new URLSearchParams({ name: "Bob" })`, header
   `content-type: application/x-www-form-urlencoded`, `redirect: "manual"`),
   expect a redirect status (3xx); then `GET /users` → body now contains `Bob`.
   This exercises `parseFormBody`.

For POST, use:
```ts
const res = await fetch(`${base}/users/new`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ name: "Bob" }).toString(),
  redirect: "manual",
});
```

**Verify**: `pnpm --filter @jvelo/tapemark-cli exec vitest run src/__tests__/serve.test.ts`
→ all single-DB cases pass.

### Step 3: Multi-DB routing tests

In a separate `describe("serve (multi DB)")` with its own server started with
**two** DB paths on a fresh free port. Seed e.g. `usersdb` with a `users` table
and `tagsdb` with a `tags` table (the DB display name derives from the file
basename — `serve.ts:75-77` — so name the temp files so their basenames are
distinct and identifier-safe, e.g. `.../alpha-<ts>.db`, `.../beta-<ts>.db`).

Assertions:

1. `GET /` → `status 200`, body lists both database names (the
   `renderDatabaseListPage` output).
2. `GET /<name1>/users` (the first DB's prefix) → `status 200`, body contains a
   `users` row you inserted.
3. `GET /<unknown-db>/whatever` → `status 404`, body contains `Not Found`.
4. `GET /_tapemark/styles.css` → `status 200`, `content-type` includes `text/css`.

Note the DB `name` is the file basename with `.db`/`.sqlite` stripped and
non-`[a-zA-Z0-9_-]` replaced by `_` — compute the expected prefix the same way,
or just read it from the GET `/` body.

**Verify**: `pnpm --filter @jvelo/tapemark-cli exec vitest run src/__tests__/serve.test.ts`
→ all multi-DB cases pass.

### Step 4: Full gate

**Verify**:
- `pnpm --filter @jvelo/tapemark-cli test` → all pass (inspect + serve).
- `pnpm run lint` → exit 0.

## Test plan

- New file `packages/cli/src/__tests__/serve.test.ts` with two describes
  (single-DB, multi-DB), each spawning a real server on an OS-assigned free port.
- Cases: GET list, GET table rows, unknown-table 404, POST create round-trip
  (single); DB list, prefixed routing, unknown-DB 404, shared asset (multi).
- Structural/setup pattern: `packages/cli/src/__tests__/inspect.test.ts`
  (temp DBs via `tmpdir()`, `ROOT`/CLI path resolution, `beforeAll`/`afterAll`).
- Each `describe`'s `beforeAll` must `await waitForServer` and have a generous
  vitest timeout (see STOP conditions). Pass a timeout to the hooks if needed:
  `beforeAll(async () => {...}, 30000)`.

## Done criteria

ALL must hold:

- [ ] `packages/cli/src/__tests__/serve.test.ts` exists.
- [ ] `pnpm --filter @jvelo/tapemark-cli test` exits 0 with both single-DB and
      multi-DB cases passing (≥4 single, ≥4 multi).
- [ ] The suite includes a POST round-trip that creates a row and reads it back.
- [ ] No server is left running after the suite (`afterAll` kills the child).
- [ ] `pnpm run lint` exits 0.
- [ ] `serve.ts` is unmodified (`git status` shows only the new test file).
- [ ] `plans/README.md` status row for 004 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The server child process cannot be started or `waitForServer` times out even
  after raising the hook timeout to 30s — report the spawn command and any
  captured stderr (temporarily set `stdio: "inherit"` to see it).
- `fetch` is not defined in the test runtime (would indicate a Node <18 runtime;
  the repo requires ≥20 — report the mismatch).
- A test reveals behavior that contradicts the "Current state" description (e.g.
  unknown table returns 200, or multi-DB prefix not stripped) — that is a real
  bug; record it for plan 005 and report it, do not change `serve.ts`.
- Port collisions make the suite flaky despite `getFreePort` — report it rather
  than hard-coding ports.

## Maintenance notes

- These are black-box tests against the spawned CLI, so they survive the
  internal refactor in plan 005 (shared server helper) without changes — that is
  the point of writing them first.
- They are slower than unit tests (process spawn + HTTP). If CI time becomes a
  concern, a later refactor could export the request handler from `serve.ts` for
  in-process testing; note that as a follow-up rather than doing it here.
- Reviewer should confirm `afterAll` always runs `child.kill()` (no leaked
  processes) and that temp DB files are cleaned up.
