# Plan 002: Add a working typecheck gate across the monorepo and into CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat b61671a..HEAD -- package.json tsconfig.json .github/workflows/ci.yml packages/core/tsconfig.json packages/cli/tsconfig.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `b61671a`, 2026-06-12

## Why this matters

This is a published TypeScript library, but **nothing typechecks it**. The root
`check` script runs `tsc -b`, yet `typescript` is not a root dependency, so the
script dies with `tsc: command not found`. Even with TypeScript installed,
`tsc -b` fails: the root `tsconfig.json` references only `packages/core` as a
composite project whose `outDir` is `dist/`, which collides with the artifacts
`vite build` already wrote there (`error TS6305: Output file ... has not been
built from source file ...`). CI (`.github/workflows/ci.yml`) runs **lint,
build, test** — never a typecheck. `vite build` transpiles with esbuild/rollup
and does not fail on type errors in code paths that don't surface in the emitted
`.d.ts`. Net result: a type error can land on `main` undetected.

After this plan, `pnpm run check` typechecks **every** package with
`tsc --noEmit` (no `dist/` collision), and CI fails on type errors.

## Current state

The root `check` script, `package.json:8-14`:

```json
"scripts": {
  "build": "pnpm -r --workspace-concurrency=1 run build",
  "test": "pnpm -r run test",
  "check": "tsc -b",
  "lint": "eslint .",
  ...
}
```

Root `package.json:24-29` devDependencies (note: no `typescript`):

```json
"devDependencies": {
  "eslint": "^10.1.0",
  "eslint-plugin-import-x": "^4.16.2",
  "tsx": "^4.0.0",
  "typescript-eslint": "^8.57.1"
}
```

Root `tsconfig.json` is **both** the shared base config (compilerOptions other
packages `extends`) **and** a solution file referencing core:

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["ES2022"], "strict": true, "esModuleInterop": true,
    "skipLibCheck": true, "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true, "declaration": true, "declarationMap": true,
    "sourceMap": true, "jsx": "react-jsx", "jsxImportSource": "hono/jsx"
  },
  "references": [ { "path": "packages/core" } ]
}
```

`packages/core/tsconfig.json` — composite, emits to `dist` (this is what
collides with vite output under `tsc -b`):

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "composite": true, "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`packages/cli/tsconfig.json` — note it already uses `"noEmit": true` and does
**not** extend the root, and is **not** referenced by the root solution file, so
it is never typechecked by `tsc -b` today:

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["ES2022"], "strict": true, "esModuleInterop": true,
    "skipLibCheck": true, "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true, "sourceMap": true, "outDir": "dist", "noEmit": true
  },
  "include": ["src"]
}
```

The five workspace packages and their `package.json` names:
- `packages/core` → `@jvelo/tapemark`
- `packages/cli` → `@jvelo/tapemark-cli`
- `packages/adapters/hono` → `@jvelo/tapemark-hono`
- `packages/db-adapters/d1` → `@jvelo/tapemark-d1`
- `packages/db-adapters/better-sqlite3` → `@jvelo/tapemark-better-sqlite3`

Each package builds with `vite build` and tests with `vitest run`. The repo uses
hono/jsx (`jsx: "react-jsx"`, `jsxImportSource: "hono/jsx"`) — `.tsx` files must
typecheck under that setting. The pinned TypeScript across packages is
`^5.7.0` (e.g. `packages/core/package.json` devDependencies); the version
resolved in the lockfile is `5.9.3`.

CI, `.github/workflows/ci.yml` (the relevant run steps):

```yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run build
      - run: pnpm run test
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Per-package check (after Step 2) | `pnpm --filter @jvelo/tapemark exec tsc --noEmit -p tsconfig.json` | exit 0, no errors |
| Whole-repo check (after Step 3) | `pnpm run check` | exit 0, no errors |
| Lint | `pnpm run lint` | exit 0 |
| Build (must still work) | `pnpm run build` | exit 0 |

## Scope

**In scope** (modify):
- `package.json` (root) — add `typescript` devDependency; rewrite `check` script.
- `packages/core/package.json`, `packages/cli/package.json`,
  `packages/adapters/hono/package.json`, `packages/db-adapters/d1/package.json`,
  `packages/db-adapters/better-sqlite3/package.json` — add a `check` script each.
- `packages/adapters/hono/tsconfig.json`, `packages/db-adapters/d1/tsconfig.json`,
  `packages/db-adapters/better-sqlite3/tsconfig.json` — **only if** a package
  lacks a tsconfig (create a minimal one mirroring `packages/cli/tsconfig.json`).
- `pnpm-lock.yaml` — will update from `pnpm install`; commit it.
- `.github/workflows/ci.yml` — add a typecheck step.

**Out of scope** (do NOT touch):
- `vite.config.ts` files and the build pipeline — builds must keep working
  exactly as-is; this plan only *adds* a check, it does not change emission.
- `packages/core/tsconfig.json`'s `composite`/`outDir` setup is consumed by
  `vite-plugin-dts`; do not remove `composite` or `outDir`. Add a *separate*
  no-emit check rather than repurposing the build tsconfig (see Step 2).
- The root `tsconfig.json` `compilerOptions` (other packages extend them) —
  leave the compiler options and `jsx` settings unchanged. You may remove the
  `references` array only if Step 3 stops using `tsc -b` (it does); removing it
  is optional and low-value — prefer leaving it.

## Git workflow

- Branch: `advisor/002-typecheck-gate`
- Plain imperative commit subject, e.g. `Add a typecheck gate to CI`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add TypeScript to the root and confirm the binary resolves

In root `package.json`, add to `devDependencies` (keep alphabetical-ish order
with the existing entries):

```json
"typescript": "^5.7.0"
```

Run `pnpm install`.

**Verify**: `pnpm exec tsc --version` → prints a `Version 5.x` line, exit 0.

### Step 2: Give every package a no-emit `check` script

The goal: each package typechecks its own `src` with `--noEmit` so there is no
`dist/` collision. Two cases:

**a) Packages that already have a usable tsconfig** (`core`, `cli`): add a
`check` script that runs `tsc --noEmit` against a config that does not emit.
- `cli` already has `"noEmit": true`, so its script is simply
  `"check": "tsc --noEmit"`.
- `core`'s tsconfig is `composite` with `outDir: dist` (needed by the build).
  Do **not** typecheck through that. Instead add a sibling config
  `packages/core/tsconfig.check.json`:

  ```json
  {
    "extends": "./tsconfig.json",
    "compilerOptions": { "composite": false, "noEmit": true },
    "include": ["src"]
  }
  ```

  and set core's script to `"check": "tsc --noEmit -p tsconfig.check.json"`.

**b) Packages that may lack a tsconfig** (`adapters/hono`, `db-adapters/d1`,
`db-adapters/better-sqlite3`): check whether each has a `tsconfig.json`. If one
does not exist, create it mirroring `packages/cli/tsconfig.json` verbatim
(the same compilerOptions block with `"noEmit": true` and `"include": ["src"]`).
If a package already has a tsconfig, reuse it and ensure the `check` script
passes `--noEmit`. For `.tsx`-containing packages (none of these three render
JSX, but confirm), ensure `jsx`/`jsxImportSource` are present — mirror the root
config's `"jsx": "react-jsx", "jsxImportSource": "hono/jsx"` if the package has
`.tsx` files.

Add to each package's `package.json` scripts:
```json
"check": "tsc --noEmit"
```
(or the `-p tsconfig.check.json` variant for `core`).

Run the per-package check for each, fixing **only genuine type errors** if any
surface (report them rather than silencing with `any`/`@ts-ignore`).

**Verify** (run all five):
- `pnpm --filter @jvelo/tapemark check` → exit 0
- `pnpm --filter @jvelo/tapemark-cli check` → exit 0
- `pnpm --filter @jvelo/tapemark-hono check` → exit 0
- `pnpm --filter @jvelo/tapemark-d1 check` → exit 0
- `pnpm --filter @jvelo/tapemark-better-sqlite3 check` → exit 0

### Step 3: Make the root `check` run every package

Replace the root `check` script (currently `"check": "tsc -b"`) with a recursive
run:

```json
"check": "pnpm -r run check"
```

**Verify**: `pnpm run check` → runs the `check` script in all five packages, all
exit 0. If any package reports type errors, that is a real defect this gate was
meant to catch — fix it if small and obviously correct, otherwise STOP and report
the errors verbatim (see STOP conditions).

### Step 4: Wire it into CI

In `.github/workflows/ci.yml`, add a typecheck step. Put it right after lint and
before build (fast feedback first):

```yaml
      - run: pnpm run lint
      - run: pnpm run check
      - run: pnpm run build
      - run: pnpm run test
```

**Verify**: `grep -n "pnpm run check" .github/workflows/ci.yml` → one match.

### Step 5: Add `check` to the prerelease gate (optional but recommended)

The root `prerelease` script is `"pnpm run lint && pnpm run test && pnpm run build"`.
Insert `check`:

```json
"prerelease": "pnpm run lint && pnpm run check && pnpm run test && pnpm run build"
```

**Verify**: `pnpm run check && pnpm run lint && pnpm run build && pnpm run test`
all exit 0 locally.

## Test plan

This plan adds a static gate, not runtime tests. Verification is the commands
above. Do not add or modify vitest tests. The proof the gate works:
`pnpm run check` exits 0 on the current tree, and a deliberately introduced type
error (e.g. assigning a `number` to a `string` in `packages/core/src/index.ts`,
then reverting) makes `pnpm run check` exit non-zero. You may perform that
manual sanity check but must revert it before finishing.

## Done criteria

ALL must hold:

- [ ] `pnpm exec tsc --version` works (root has TypeScript).
- [ ] `pnpm run check` runs a `check` script in all five packages and exits 0.
- [ ] Each package's `package.json` has a `check` script.
- [ ] `.github/workflows/ci.yml` contains a `pnpm run check` step before build.
- [ ] `pnpm run build` and `pnpm run test` still exit 0 (no regression).
- [ ] `pnpm run lint` exits 0.
- [ ] `git status` shows only in-scope files changed (plus `pnpm-lock.yaml`).
- [ ] `plans/README.md` status row for 002 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm run check` surfaces type errors that are **not** trivially fixable
  (anything requiring a non-obvious type change, a refactor, or a judgment call
  about intended types). Report the full error output; do not paper over it with
  `any`, `as`, or `@ts-ignore`.
- Removing the `dist/` collision still leaves `tsc` failing with TS6305 or
  similar build-orchestration errors — that means a package is still emitting;
  re-check that its `check` config has `noEmit: true` and `composite: false`.
- The drift check shows the tsconfig/CI files already changed since `b61671a`.
- A package has no `src` directory or an unexpected layout.

## Maintenance notes

- New packages must add a `check` script (`tsc --noEmit`) or they silently
  escape the gate — the root `pnpm -r run check` only runs packages that define
  the script. A reviewer adding a package should require it.
- If `core`'s build tsconfig changes (e.g. drops `composite`), revisit whether
  `tsconfig.check.json` is still needed.
- Compiler-option fixes needed to make `check` pass (e.g. `lib`, `jsx`) must go in
  the package's **real** `tsconfig.json` — the config `vite build`'s DTS pass uses —
  not the `tsconfig.check.json` sibling. Otherwise the gate checks a more permissive
  surface than the build (it goes green while `pnpm run build` still emits the
  diagnostic). The `.check.json` should differ from the base ONLY by
  `composite: false` + `noEmit: true`. (Lesson from the hono adapter, where a `DOM`
  lib fix initially landed in `tsconfig.check.json` and masked a build-time TS2769.)
- This does not add formatting/Prettier — intentionally out of scope.
- Reviewer should confirm CI actually fails on a type error (watch the first PR
  after this lands, or eyeball the workflow run).
