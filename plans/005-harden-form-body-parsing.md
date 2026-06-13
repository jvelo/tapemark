# Plan 005: Harden form-body parsing (stream errors, size cap, multibyte) and de-duplicate the CLI copy

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat b61671a..HEAD -- packages/cli/src/serve.ts examples/standalone/serve.ts examples/hooks-and-actions/serve.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: plans/004-cli-serve-http-tests.md (its black-box HTTP tests are
  the safety net for the `serve.ts` change here; land 004 first)
- **Category**: bug + tech-debt
- **Planned at**: commit `b61671a`, 2026-06-12

## Why this matters

`parseFormBody` exists as three byte-for-byte-similar copies (CLI + both
examples), and all three share one real bug: the returned Promise has **no
error path**. It attaches `req.on("data")` and `req.on("end")` but never
`req.on("error")`, so if the request stream errors (client disconnect,
truncated body), the Promise neither resolves nor rejects and the request
handler hangs forever — a stalled connection per occurrence. Two secondary
issues: the body is accumulated with no size limit (a large POST grows an
in-memory string unbounded), and the `data` chunk is typed/handled as a
`string`, so a multi-byte UTF-8 character split across two chunks can be
corrupted (each `Buffer`→string coercion happens at the chunk boundary).

This plan fixes the bug in all three copies, and gives the CLI a single canonical
implementation (`packages/cli/src/http.ts`) so its copy can't drift again. The
two example servers keep an inline server on purpose — their value is showing how
little glue tapemark needs — but they get the same hardened parser so they don't
ship a known-hanging bug.

## Current state

The CLI copy, `packages/cli/src/serve.ts:236-258`:

```ts
function parseFormBody(
  req: IncomingMessage,
): Promise<Record<string, string | string[]>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: string) => (data += chunk));
    req.on("end", () => {
      const result: Record<string, string | string[]> = {};
      const params = new URLSearchParams(data);
      for (const [key, value] of params) {
        const existing = result[key];
        if (existing) {
          result[key] = Array.isArray(existing)
            ? [...existing, value]
            : [existing, value];
        } else {
          result[key] = value;
        }
      }
      resolve(result);
    });
  });
}
```

`serve.ts` also has `sendResponse` (`serve.ts:220-234`) used alongside it. The
call site is inside the server's `try` block (`serve.ts:113-115`):

```ts
        let body: Record<string, string | string[]> | undefined;
        if (req.method === "POST") {
          body = await parseFormBody(req);
        }
```

so once `parseFormBody` can **reject**, the existing `catch` at `serve.ts:177-181`
(returns 500 + `Internal Server Error`) already handles it — no new error
plumbing needed.

The two example copies are functionally identical:
- `examples/standalone/serve.ts:169-191` (`parseFormBody`), call site `:138-141`,
  inline try/catch server at `:129-167`.
- `examples/hooks-and-actions/serve.ts:167-184` (`parseFormBody`), call site
  `:140-143`, inline try/catch server at `:132-165`.

Both examples import from source paths
(`../../packages/db-adapters/better-sqlite3/src/index.js`,
`../../packages/core/src/index.js`) and run via `tsx`. The hooks example header
comment explicitly says the server is "minimal, same shape as the standalone
example" — i.e. inline-by-design.

Conventions: `IncomingMessage` is imported from `node:http`. The repo targets
Node ≥20 (`package.json` engines). The CLI package name is `@jvelo/tapemark-cli`;
it tests with `vitest run` (`packages/cli/src/__tests__/inspect.test.ts` is the
existing pattern).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| CLI tests (all) | `pnpm --filter @jvelo/tapemark-cli test` | all pass |
| Single test file | `pnpm --filter @jvelo/tapemark-cli exec vitest run src/__tests__/http.test.ts` | new file passes |
| Typecheck (if plan 002 landed) | `pnpm --filter @jvelo/tapemark-cli check` | exit 0 |
| Lint | `pnpm run lint` | exit 0 |
| Examples still start | see Step 4 | server prints its URL, then kill it |

## Scope

**In scope** (modify/create):
- `packages/cli/src/http.ts` (create) — canonical hardened `parseFormBody` +
  `sendResponse`.
- `packages/cli/src/serve.ts` — import from `./http.ts`; delete the inline
  `parseFormBody` and `sendResponse`.
- `packages/cli/src/__tests__/http.test.ts` (create) — unit tests for the parser.
- `examples/standalone/serve.ts` — harden the inline `parseFormBody` in place.
- `examples/hooks-and-actions/serve.ts` — harden the inline `parseFormBody` in
  place.

**Out of scope** (do NOT touch):
- The core package and the Hono adapter's body parsing (`adapters/hono` uses
  `c.req.parseBody`, a different, already-safe path).
- Converting the examples to import the shared helper — keep them inline
  (intentional teaching shape); only fix the bug.
- The server routing logic in `serve.ts` — only move the two helpers out; do not
  change request handling.
- Adding new dependencies (e.g. `busboy`) — the URL-encoded parser is sufficient.

## Git workflow

- Branch: `advisor/005-harden-form-body-parsing`
- Plain imperative commit subject, e.g. `Harden form-body parsing against stream errors`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create the canonical hardened parser in the CLI

Create `packages/cli/src/http.ts`. Move `sendResponse` from `serve.ts` verbatim,
and add a hardened `parseFormBody`. Target shape for the parser:

```ts
import type { IncomingMessage, ServerResponse } from "node:http";

/** Max accepted request body (bytes). Admin form posts are tiny; this only
 *  guards against unbounded in-memory growth. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

export function parseFormBody(
  req: IncomingMessage,
): Promise<Record<string, string | string[]>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const data = Buffer.concat(chunks).toString("utf-8");
      const result: Record<string, string | string[]> = {};
      for (const [key, value] of new URLSearchParams(data)) {
        const existing = result[key];
        if (existing) {
          result[key] = Array.isArray(existing)
            ? [...existing, value]
            : [existing, value];
        } else {
          result[key] = value;
        }
      }
      resolve(result);
    });
    req.on("error", reject);
  });
}
```

Also move `sendResponse` (and its small inline param type) into this file and
`export` it. Keep its body unchanged.

**Verify**: `pnpm --filter @jvelo/tapemark-cli exec vitest run` (no new test yet)
→ existing CLI tests still pass; file compiles (no import errors).

### Step 2: Point `serve.ts` at the shared module

In `packages/cli/src/serve.ts`:
- Add `import { parseFormBody, sendResponse } from "./http";` near the other
  imports.
- Delete the inline `parseFormBody` function (`serve.ts:236-258`) and the inline
  `sendResponse` function (`serve.ts:220-234`).
- Remove now-unused imports if any (e.g. if `ServerResponse`/`IncomingMessage`
  were only used by the moved helpers — check; `IncomingMessage` may still be
  referenced, `ServerResponse` likely becomes unused).

**Verify**:
- `pnpm --filter @jvelo/tapemark-cli exec vitest run src/__tests__/inspect.test.ts`
  → passes.
- If plan 004 has landed:
  `pnpm --filter @jvelo/tapemark-cli exec vitest run src/__tests__/serve.test.ts`
  → the POST round-trip test still passes (proves the moved parser works
  end-to-end).
- `grep -n "function parseFormBody" packages/cli/src/serve.ts` → no match.

### Step 3: Add unit tests for the parser

Create `packages/cli/src/__tests__/http.test.ts`. Drive `parseFormBody` with a
minimal fake request — a `node:events` `EventEmitter` cast to the parameter type
is enough (it only uses `.on(...)` and `.destroy?.()`):

```ts
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { describe, it, expect } from "vitest";
import { parseFormBody } from "../http";

function fakeReq(): IncomingMessage & EventEmitter {
  const e = new EventEmitter() as IncomingMessage & EventEmitter;
  (e as unknown as { destroy: () => void }).destroy = () => {};
  return e;
}
```

Cover:
1. **Happy path**: emit one `data` Buffer of `a=1&b=2`, then `end`; resolves to
   `{ a: "1", b: "2" }`.
2. **Repeated keys**: `tag=x&tag=y` → `{ tag: ["x", "y"] }`.
3. **Multibyte across chunks**: emit a `Buffer` that is the first half of a
   multi-byte UTF-8 sequence, then the second half, then `end`; the decoded
   value must be the intact character (use a known multibyte string, split its
   `Buffer` at an odd byte index). This proves the `Buffer.concat` fix.
4. **Stream error rejects**: emit an `error` event; the Promise **rejects** (use
   `await expect(promise).rejects.toThrow()`).
5. **Oversized body rejects**: emit a `data` Buffer larger than `MAX_BODY_BYTES`
   (you may temporarily export the constant, or emit `> 5 MB`); the Promise
   rejects. (If exporting the constant is undesirable, allocate a `Buffer` of
   `5 * 1024 * 1024 + 1` bytes — `Buffer.alloc` — and assert rejection.)

Emit events on the next tick so the `.on(...)` handlers are registered first,
e.g. wrap emits in `queueMicrotask(() => { req.emit("data", buf); req.emit("end"); })`
after calling `parseFormBody(req)`.

**Verify**: `pnpm --filter @jvelo/tapemark-cli exec vitest run src/__tests__/http.test.ts`
→ all 5 pass.

### Step 4: Harden the two example parsers in place

In both `examples/standalone/serve.ts` and
`examples/hooks-and-actions/serve.ts`, replace the inline `parseFormBody` body
with the hardened version from Step 1 (same logic: `Buffer[]` accumulation,
size cap, `req.on("error", reject)`, `Buffer.concat(...).toString("utf-8")`).
Keep them inline (do not import from the CLI). Add a one-line comment above each
noting the canonical version: `// Canonical version: packages/cli/src/http.ts`.

The examples' existing try/catch servers already `await parseFormBody(req)`
inside the try, so rejection now yields the existing 500 path — no other change
needed.

**Verify** (each example must still boot; start it, confirm the URL line, then
kill it):
- `npx tsx examples/standalone/serve.ts --port 39561 &` then after ~1s confirm it
  logged `http://localhost:39561`, then `kill %1` (or kill the process). A quick
  scripted check: start it, `curl -s -o /dev/null -w "%{http_code}" http://localhost:39561/`
  returns `200`, then kill it.
- Same for `examples/hooks-and-actions/serve.ts` (it hard-codes port 3334; start,
  `curl` `http://localhost:3334/`, expect `200`, then kill).

### Step 5: Full gate

**Verify**:
- `pnpm --filter @jvelo/tapemark-cli test` → all pass (inspect + http + serve).
- `pnpm run lint` → exit 0.
- If plan 002 landed: `pnpm --filter @jvelo/tapemark-cli check` → exit 0.

## Test plan

- New `packages/cli/src/__tests__/http.test.ts`: 5 unit cases (happy, repeated
  keys, multibyte-across-chunks, error-rejects, oversized-rejects).
- Structural pattern for CLI tests: `packages/cli/src/__tests__/inspect.test.ts`
  (imports, `describe`/`it`/`expect` from vitest). The fake-request approach is
  specified inline above.
- Regression safety for `serve.ts`: plan 004's `serve.test.ts` POST round-trip
  (if landed) must still pass after the helper move.
- Verification: `pnpm --filter @jvelo/tapemark-cli test` → all pass.

## Done criteria

ALL must hold:

- [ ] `packages/cli/src/http.ts` exists and exports `parseFormBody` and
      `sendResponse`; its `parseFormBody` attaches `req.on("error", reject)`,
      caps size, and decodes via `Buffer.concat`.
- [ ] `grep -n "function parseFormBody" packages/cli/src/serve.ts` → no match
      (CLI uses the shared module).
- [ ] `grep -n "req.on(\"error\"" examples/standalone/serve.ts examples/hooks-and-actions/serve.ts`
      → a match in each (examples hardened in place).
- [ ] `pnpm --filter @jvelo/tapemark-cli test` exits 0 with the 5 new http tests
      passing.
- [ ] Both examples start and answer `200` on `/` (Step 4).
- [ ] `pnpm run lint` exits 0.
- [ ] `git status` shows only in-scope files changed.
- [ ] `plans/README.md` status row for 005 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows any of the three `serve.ts` files changed since `b61671a`
  in a way that makes the excerpts wrong.
- Removing `sendResponse`/`parseFormBody` from `serve.ts` leaves a referenced
  symbol undefined that isn't simply the moved helper (suggests other code grew
  to depend on them).
- An example fails to boot after the change (port already in use is not a
  failure — pick another port; a crash/stack trace is).
- The multibyte test can't be made deterministic — report it rather than
  weakening the assertion.

## Maintenance notes

- The examples now hold a second copy of the parser by deliberate choice (inline
  teaching servers). If a third behavior change is ever needed, reconsider
  whether a tiny shared Node-http helper package is warranted — but it wasn't
  worth the extra package here.
- `MAX_BODY_BYTES` (5 MB) is generous for admin forms; if file-upload support is
  ever added, this parser and the limit must be revisited (and a multipart parser
  introduced — out of scope now).
- Reviewer should confirm the rejection path is reachable (the `await
  parseFormBody` sits inside the server's try/catch in all three files) and that
  no behavior other than error/oversize handling changed.
