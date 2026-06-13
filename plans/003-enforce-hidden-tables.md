# Plan 003: Enforce `hidden` tables server-side (not just in the listing)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat b61671a..HEAD -- packages/core/src/router.ts packages/core/src/routes/tables.tsx README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b61671a`, 2026-06-12

## Why this matters

A per-table `hidden: true` option currently only removes the table from the
**listing page** (`routes/tables.tsx`). Every other route — list rows
(`/:table`), view/edit/delete a row (`/:table/_row/:index`, `/:table/:pk`),
create (`/:table/new`), the FK lookup (`/:table/_lookup`), config, bulk-delete,
and custom actions — serves the table normally if you navigate there directly by
URL. So `hidden` looks like an access boundary but isn't one: anyone who knows or
guesses the table name can read it, and (unless `readonly`) write to it.

By contrast, the sibling `readonly` option **is** enforced server-side
(`routes/guard.ts:assertWritable`). This asymmetry is a trap for an integrator
who sets `hidden: true` on a sensitive table expecting it to be unreachable.

This plan makes `hidden` behave consistently: a hidden table is treated as
**not present** — every route for it returns 404, exactly as if the table were
absent from the listing. One chokepoint in the router covers all routes.

## Current state

`hidden` is applied only here, `packages/core/src/routes/tables.tsx:36-39`:

```tsx
const visible = all.filter(
  (t) => !ctx.tableOptions.get(t.name)?.hidden,
);
```

The router already has every table route under a `:table` param and already
builds an error page for 404s. `packages/core/src/router.ts:182-197` (inside
`handle`):

```ts
    // Match route
    const match = matchRoute(routes, req.method, req.path);
    if (!match) {
      return renderErrorPage(404, "Not Found", errorCtx);
    }

    // Inject matched params into the request
    const enrichedReq: TapemarkRequest = {
      ...req,
      params: { ...req.params, ...match.params },
    };

    const ctx = buildContext(db, overrides);

    try {
      return await match.handler(enrichedReq, ctx);
```

The per-table options map is in scope in this closure,
`packages/core/src/router.ts:115-117`:

```ts
  const tableOptionsMap = new Map(
    Object.entries(options.tables ?? {}),
  );
```

Every built-in table route uses the param name `table` (verified — patterns at
`router.ts:257-271`): `/:table/new`, `/:table/_config`, `/:table/_lookup`,
`/:table/_bulk-delete`, `/:table/_row/:index`, `/:table/:pk`,
`/:table/:pk/_action/:actionName`, `/:table`. The non-table routes (`/` and
`/_tapemark/...`) have no `table` param, so they are unaffected by a check keyed
on `match.params.table`.

`errorCtx` is already constructed at the top of `handle`
(`router.ts:163-170`) and is what the existing 404 path uses.

The `hidden` option type, `packages/core/src/types.ts:141` (per-table options):

```ts
  hidden?: boolean;
```

README documents `hidden` at `README.md:106-108` as "or { hidden: true }" with
no statement about access — that wording needs a one-line clarification (Step 3).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Core tests (all) | `pnpm --filter @jvelo/tapemark test` | all pass |
| Single test file | `pnpm --filter @jvelo/tapemark exec vitest run src/__tests__/router.test.ts` | passes |
| Lint | `pnpm run lint` | exit 0 |

## Scope

**In scope** (modify):
- `packages/core/src/router.ts` — add the hidden-table 404 chokepoint.
- `packages/core/src/__tests__/router.test.ts` — add regression cases.
- `README.md` — one-line clarification of `hidden`'s behavior.

**Out of scope** (do NOT touch):
- `routes/tables.tsx` — its listing filter stays as-is (still correct; a hidden
  table must not appear there either).
- `routes/guard.ts` and `readonly` handling — separate concern, already correct.
- Adding `hidden` checks inside individual route handlers — do NOT scatter the
  check; the single router chokepoint is the intended design. One place is easier
  to audit and impossible to forget on a new route.

## Git workflow

- Branch: `advisor/003-enforce-hidden-tables`
- Plain imperative commit subject, e.g. `Enforce hidden tables server-side`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the chokepoint in `router.ts`

In `handle`, immediately after the `if (!match) { return renderErrorPage(404, ...) }`
block and before building `enrichedReq`, add a check: if the matched route has a
`table` param naming a hidden table, return the same 404 the router uses for an
unmatched route.

Target shape:

```ts
    const match = matchRoute(routes, req.method, req.path);
    if (!match) {
      return renderErrorPage(404, "Not Found", errorCtx);
    }

    // A hidden table is treated as absent: every route for it 404s,
    // matching the listing, which already omits it.
    if (match.params.table && tableOptionsMap.get(match.params.table)?.hidden) {
      return renderErrorPage(404, "Not Found", errorCtx);
    }
```

Use `tableOptionsMap` (already in the closure). Do not import anything new.

**Verify**: `pnpm --filter @jvelo/tapemark exec vitest run src/__tests__/router.test.ts`
→ existing tests still pass.

### Step 2: Add regression tests

In `packages/core/src/__tests__/router.test.ts` (it already imports
`createTapemark`, `createTestDb`, and defines `makeReq`), add a `describe`
block for hidden tables. Using the existing `SCHEMA` (`users` table), assert:

1. `createTapemark({ db, tables: { users: { hidden: true } } })`, request
   `GET /users` → `status 404`.
2. Same config, request `GET /users/_lookup?q=a` → `status 404` (covers the
   non-CRUD route).
3. Same config, request `POST /users/1` (an update attempt) → `status 404`
   (mutations on a hidden table are also blocked).
4. **Control**: with no `tables` option, `GET /users` → `status 200` (the table
   is reachable when not hidden — proves the check is scoped to hidden tables).

Build the POST request with `makeReq({ method: "POST", path: "/users/1", body: { name: "x" } })`.

**Verify**: `pnpm --filter @jvelo/tapemark exec vitest run src/__tests__/router.test.ts`
→ all pass, including the 4 new assertions.

### Step 3: Document the behavior

In `README.md`, find the per-table options line (around `README.md:106-108`):

```
    sites: { readonly: true }, // or { hidden: true }, or hooks/actions (below)
```

Add a short clarifying sentence near the per-table options description stating
that `hidden` removes the table from the UI **and** makes all of its routes
return 404 (it is not merely cosmetic). Keep it terse — one sentence — matching
the README's existing tone. Example wording:

> `hidden: true` hides the table from the listing and makes every route for it
> return 404 (so it can't be reached by direct URL).

**Verify**: `grep -n "hidden" README.md` → shows the new sentence.

### Step 4: Full gate

**Verify**:
- `pnpm --filter @jvelo/tapemark test` → all pass.
- `pnpm run lint` → exit 0.

## Test plan

- Extend `packages/core/src/__tests__/router.test.ts` with a `describe("hidden tables")`
  block: 3 blocked-route cases (GET list, GET lookup, POST update) + 1 control
  (not hidden → 200).
- Structural pattern: the existing `describe("createTapemark")` cases in the same
  file already show `createTapemark({ db, ... })` + `core.handle(makeReq(...))` +
  `expect(res.status)`.
- Verification: `pnpm --filter @jvelo/tapemark test` → all pass including new cases.

## Done criteria

ALL must hold:

- [ ] `pnpm --filter @jvelo/tapemark test` exits 0; `router.test.ts` has a hidden-
      tables block with ≥4 passing assertions including a POST-blocked case and a
      not-hidden control.
- [ ] `grep -n "hidden" packages/core/src/router.ts` returns a match.
- [ ] README states `hidden` returns 404 on direct access.
- [ ] `pnpm run lint` exits 0.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row for 003 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `router.ts` already changed since `b61671a`, or the
  `handle`/`matchRoute`/`tableOptionsMap` shapes differ from the excerpts.
- Any built-in route is found to use a table param name other than `table`
  (the chokepoint keys on `match.params.table`); if so, report it — a different
  approach is needed.
- Adding the check breaks an existing test in a way that suggests some route is
  *expected* to serve hidden tables (it should not be).

## Maintenance notes

- New table routes automatically inherit this protection as long as they use the
  `:table` param name. A reviewer adding a route with a differently-named table
  param must extend the chokepoint.
- This treats `hidden` as "absent", not "forbidden" — a 404, not a 403 — which
  avoids confirming the table exists. That's deliberate; keep it a 404.
- Out of scope / deferred: column-level `hidden` (a separate config field used by
  `DataTable.tsx`) is unrelated and unchanged.
- Reviewer should confirm the listing filter in `tables.tsx` is untouched (hidden
  tables must still not appear there).
