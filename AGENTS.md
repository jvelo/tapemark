# Working on Tapemark

Read [PHILOSOPHY.md](PHILOSOPHY.md) first — it defines what Tapemark is, its design
principles, and its aesthetic direction. Everything else assumes that context.

Tapemark is source-available (MPL-2.0) and not currently accepting external
contributions (see [CONTRIBUTING.md](CONTRIBUTING.md)). These notes are for whoever —
human or agent — is working in the repo.

## Layout

pnpm workspace:

- `packages/core` — framework-agnostic core (`@jvelo/tapemark`): router, schema
  introspection, CRUD, server-rendered Preact UI
- `packages/cli` — `serve` / `inspect` CLI (`@jvelo/tapemark-cli`)
- `packages/adapters/hono` — Hono sub-app adapter
- `packages/db-adapters/{d1,better-sqlite3}` — database adapters

## Commands

```bash
pnpm install
pnpm run lint        # eslint, incl. the MPL license-header check
pnpm run check       # typecheck (tsc, strict)
pnpm run test        # vitest, all packages
pnpm run build       # build all packages
pnpm run prerelease  # lint + check + test + build — the CI gate
```

Run the CLI from source: `pnpm exec tsx packages/cli/src/index.ts serve ./data.db`.

## Conventions

- **License headers.** Every source file carries an `MPL-2.0` header; `pnpm run lint`
  fails without it and `pnpm run lint:fix` adds it. Keep the `SPDX-License-Identifier`
  line — the lint rule recognizes a header by it.
- **Adapter boundary.** Database access goes through the thin `Database` interface
  (`prepare → bind/all/first/run`). Core code stays adapter-agnostic so it runs on both
  D1 and better-sqlite3; don't reach for driver-specific APIs in `core`.
- **Releases.** `pnpm run release:{patch,minor,major}` bumps every package, commits,
  tags, and pushes; the tag triggers the publish workflow.
