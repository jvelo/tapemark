# Contributing

Thanks for your interest in Tapemark.

## Development

```bash
pnpm install
pnpm run lint     # eslint (includes the MPL license-header check)
pnpm run check    # typecheck
pnpm run test     # all packages
pnpm run build    # build all packages
```

`pnpm run prerelease` runs lint + check + test + build — the same gate CI enforces.

Run the CLI from source:

```bash
pnpm exec tsx packages/cli/src/index.ts serve ./data.db
```

## License headers

Every source file carries an `MPL-2.0` header. `pnpm run lint` fails if one is
missing; `pnpm run lint:fix` adds it automatically to new files.

## Pull requests

- Keep PRs focused and the gate green (`pnpm run prerelease`).
- Update docs (at least the relevant README) when behavior changes.
- Contributions are licensed under [MPL-2.0](./LICENSE).
