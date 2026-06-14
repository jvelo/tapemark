# @jvelo/tapemark-cli

Zero-config CLI for [Tapemark](https://github.com/jvelo/tapemark) — browse and edit SQLite databases in a dark, monospace admin UI.

```bash
# Browse & edit in the browser (http://localhost:3333)
npx @jvelo/tapemark-cli serve ./data.db

# Quick schema overview in the terminal
npx @jvelo/tapemark-cli inspect ./data.db
```

`serve` options: `--port`, `--readonly`, `--theme <hubot|plex|depart>`, `--constraints <enforce|relaxed>`. Pass multiple `.db` files (or globs) to serve several at once. Requires Node.js ≥ 20.

See the [main README](https://github.com/jvelo/tapemark#readme) for full usage.

## License

[MPL-2.0](./LICENSE)
