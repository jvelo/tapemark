# Plan 001: Reject unvalidated column identifiers in the lookup route (SQL injection fix)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat b61671a..HEAD -- packages/core/src/routes/lookup.ts packages/core/src/references.ts packages/core/src/schema.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b61671a`, 2026-06-12

## Why this matters

The lookup endpoint (`GET /:table/_lookup`, used by the foreign-key picker) takes
a `label` query parameter and splices it **directly into SQL as a column
identifier** without validating it against the table's real columns. Everywhere
else in the codebase, column names that reach SQL are first checked with
`SchemaIntrospector.assertColumn` (regex `^[a-zA-Z_][a-zA-Z0-9_]*$` **and**
membership in the table's columns) or filtered through a `columnMap.has(key)`
guard. The lookup route skips this. Because the value lands inside a
double-quoted identifier, a crafted `label` can break out of the quoting and
inject arbitrary SQL into the `SELECT`. tapemark is a library whose whole value
is *server-side* access control (`readonly`, per-table `hidden`/`readonly`); a
SQL-injection hole defeats those guarantees (e.g. reading columns/tables the
operator intended to restrict). This is the single highest-priority finding.

The same class of bug exists in `references.ts`, where the label column comes
from persisted table config rather than the request — lower exposure, but it
should be closed the same way so the pattern is consistent.

## Current state

Files:
- `packages/core/src/routes/lookup.ts` — the `/:table/_lookup` handler. The
  table name *is* validated (`getTable` → `assertTable`), but the label column
  from the query string is **not**.
- `packages/core/src/schema.ts` — `SchemaIntrospector`, which already exposes
  the validation helper to reuse.
- `packages/core/src/references.ts` — batch FK-label resolver; same unvalidated
  label-column pattern, sourced from config.

The validator that already exists, in `packages/core/src/schema.ts:139-147`:

```ts
/** Validate that a column belongs to the given table. */
async assertColumn(table: string, column: string): Promise<void> {
  if (!SAFE_NAME.test(column)) {
    throw new NameValidationError("column", column);
  }
  const info = await this.getTable(table);
  if (!info.columns.some((c) => c.name === column)) {
    throw new NameValidationError("column", column);
  }
}
```

`NameValidationError extends NotFoundError` (`schema.ts:68`); `NotFoundError`
maps to an HTTP 404 via the router's `TapemarkError` handling. Throwing it for a
bad `label` is the right, already-wired behavior.

The vulnerable code, `packages/core/src/routes/lookup.ts:43-62` and `:83-89`:

```ts
const labelColumnOverride = req.query.label;            // line 43 — user input

const introspector = new SchemaIntrospector(ctx.db);
const tableInfo = await introspector.getTable(tableName);   // validates tableName only
// ...
const labelColumn = labelColumnOverride ?? pickLabelColumn(tableInfo);  // line 56
const valueColumn = tableInfo.primaryKey[0];

const selectCols = [`"${valueColumn}" as value`];
if (labelColumn && labelColumn !== valueColumn) {
  selectCols.push(`"${labelColumn}" as label`);        // line 61 — labelColumn into SQL
}
```

```ts
if (q && labelColumn) {
  whereSql = `WHERE "${labelColumn}" LIKE ?`;          // line 84 — labelColumn into SQL
  whereBinds = [`%${q}%`];
}
```

Note `valueColumn` comes from `tableInfo.primaryKey[0]` (schema-derived, safe).
`pickLabelColumn(tableInfo)` returns a real column name from the schema (safe).
**Only the `labelColumnOverride` from `req.query.label` is attacker-controlled.**

The parallel site, `packages/core/src/references.ts:51-62`:

```ts
const labelColumnOverride = cc?.options?.labelColumn as string | undefined;  // from config
const labelColumn = labelColumnOverride ?? pickLabelColumn(refTable);
const valueColumn = fk.referencedColumns[0];
// ...
const selectCols = [`"${valueColumn}" as value`];
if (labelColumn && labelColumn !== valueColumn) {
  selectCols.push(`"${labelColumn}" as label`);
}
const sql = `SELECT ${selectCols.join(", ")} FROM "${fk.referencedTable}" WHERE "${valueColumn}" IN (${placeholders})`;
```

Here `valueColumn` and `referencedTable` are schema-derived (safe). Only
`labelColumnOverride` (from stored table config) is non-schema input.

Repo conventions to follow:
- Validation throws `NameValidationError` (from `schema.ts`); do not invent a new
  error type or return a hand-built 400 for this — match the existing pattern.
- Tests use `createTestDb(schema)` from `packages/core/src/test-utils.ts` and
  drive routes through `createTapemark({ db }).handle(req)`. See
  `packages/core/src/__tests__/router.test.ts:1-54` for the exact shape (a
  `makeReq` helper, in-memory schema string, `expect(res.status)` / `res.html`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Core tests (all) | `pnpm --filter @jvelo/tapemark test` | all pass |
| Single test file | `pnpm --filter @jvelo/tapemark exec vitest run src/__tests__/lookup.test.ts` | new file passes |
| Lint | `pnpm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/core/src/routes/lookup.ts`
- `packages/core/src/references.ts`
- `packages/core/src/__tests__/lookup.test.ts` (create)

**Out of scope** (do NOT touch):
- `packages/core/src/schema.ts` — `assertColumn` is already correct; reuse it,
  do not modify it.
- The `valueColumn` / table-name handling in either file — already validated.
- The SQL string-building style (double-quoted identifiers + bound `?` for
  values) — keep it; the fix is *validation*, not rewriting the query builder.

## Git workflow

- Branch: `advisor/001-validate-lookup-label-column`
- Commit message style matches the repo (short imperative subject; recent
  history mixes `Closes #N ...` and plain subjects — a plain imperative subject
  like `Validate lookup label column to prevent SQL injection` is fine).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Validate the label override in `lookup.ts`

In `packages/core/src/routes/lookup.ts`, after `tableInfo` is fetched and the
`primaryKey.length === 0` guard, validate the label override **only when the
caller supplied one** (the auto-picked column from `pickLabelColumn` is already
schema-safe and must keep working).

Produce this shape (insert immediately before the existing
`const labelColumn = labelColumnOverride ?? pickLabelColumn(tableInfo);` line):

```ts
if (labelColumnOverride !== undefined) {
  await introspector.assertColumn(tableName, labelColumnOverride);
}
```

`assertColumn` throws `NameValidationError` (a 404) on a bad name, which the
router already renders. Leave the rest of the handler unchanged.

**Verify**: `pnpm --filter @jvelo/tapemark exec vitest run src/__tests__/router.test.ts`
→ existing tests still pass (no regression).

### Step 2: Validate the config label override in `references.ts`

In `packages/core/src/references.ts`, the referenced table is introspected at
`refTable = await introspector.getTable(fk.referencedTable)` inside the loop.
After that line, validate the override against the **referenced** table when one
is present:

```ts
if (labelColumnOverride !== undefined) {
  try {
    await introspector.assertColumn(fk.referencedTable, labelColumnOverride);
  } catch {
    continue; // skip resolving labels for a misconfigured column
  }
}
```

Place this so `labelColumnOverride` is read first (move the
`const labelColumnOverride = ...` line up if needed) but `labelColumn`/
`valueColumn`/SQL building stay below it. `references.ts` resolves labels for a
whole page and already uses `try/catch ... continue` for a missing referenced
table (`references.ts:44-49`) — match that resilience: a bad config column
should degrade to "no label", not throw and break the list page.

**Verify**: `pnpm --filter @jvelo/tapemark exec vitest run src/__tests__/references.test.ts`
→ existing tests still pass.

### Step 3: Add regression tests

Create `packages/core/src/__tests__/lookup.test.ts`, modeled structurally on
`packages/core/src/__tests__/router.test.ts` (same imports: `createTapemark`
from `../router`, `createTestDb` from `../test-utils`, a local `makeReq`
helper). Cover:

1. **Happy path, auto label**: schema with `users(id INTEGER PRIMARY KEY, name TEXT)`,
   request `GET /users/_lookup?q=Al`; expect `status 200` and the JSON body
   (`res.html` is the JSON string here) to contain the matched label.
2. **Happy path, explicit valid label**: `GET /users/_lookup?label=name&q=Al`;
   expect `status 200`.
3. **Rejected invalid label (the regression)**: `GET /users/_lookup?label=<bad>`
   where `<bad>` is a real column name with appended characters that are not a
   valid identifier (e.g. a value containing a double-quote and a space). Expect
   `status 404` (the `NameValidationError` path). Assert the table data was not
   leaked — `res.status` is `404`, not `200`.
4. **Rejected unknown label**: `GET /users/_lookup?label=not_a_column`; expect
   `status 404`.

Do not put any runnable injection string longer than what's needed to assert the
identifier is rejected — a column-name-plus-illegal-character is enough.

**Verify**: `pnpm --filter @jvelo/tapemark exec vitest run src/__tests__/lookup.test.ts`
→ all new tests pass (expect 4).

### Step 4: Full gate

**Verify**:
- `pnpm --filter @jvelo/tapemark test` → all pass.
- `pnpm run lint` → exit 0.

## Test plan

- New file `packages/core/src/__tests__/lookup.test.ts`, 4 cases as above
  (auto-label happy path, explicit-valid happy path, illegal-identifier
  rejection, unknown-column rejection).
- Structural pattern: `packages/core/src/__tests__/router.test.ts`.
- Verification: `pnpm --filter @jvelo/tapemark test` → all pass including the 4
  new tests.

## Done criteria

ALL must hold:

- [ ] `pnpm --filter @jvelo/tapemark test` exits 0; `src/__tests__/lookup.test.ts`
      exists with ≥4 passing tests, including one asserting an illegal `label`
      yields `status 404`.
- [ ] `pnpm run lint` exits 0.
- [ ] `grep -n "assertColumn" packages/core/src/routes/lookup.ts` returns a match.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row for 001 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (drift
  since this plan was written).
- `assertColumn` no longer exists or its signature differs from
  `assertColumn(table: string, column: string): Promise<void>`.
- Validating the auto-picked label (when no `label` query param is given) starts
  failing tests — that means `pickLabelColumn` can return a name `assertColumn`
  rejects; if so, only validate the *override* (as specified) and report the
  observation.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Any future endpoint that accepts a column name from request/query/config and
  puts it into SQL must call `SchemaIntrospector.assertColumn` first. Grep for
  `` `"${ `` in `packages/core/src` when reviewing new routes — that template
  pattern is where an identifier reaches SQL.
- Reviewer should confirm the fix validates the *override only* and does not
  break the common case where no `label` is supplied (the FK picker relies on
  the auto-picked label).
- Deferred: `references.ts` reads `labelColumn` from persisted config; a
  longer-term hardening is to validate config at write time
  (`routes/table-config.tsx`) too, but that's out of scope here.
