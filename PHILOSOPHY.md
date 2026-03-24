# Tapemark — Product Philosophy

## What it is

Tapemark is a database explorer and editor for SQLite.

It sits in between two lineages:

- **Datasette** — browse, visualize, and share data from SQLite databases. Read-first,
  query-driven, great at making data accessible.
- **React Admin** — build full CRUD admin panels backed by any API. Write-first,
  form-driven, great at managing data.

Tapemark is the hybrid. You can point it at a SQLite database and immediately browse its
contents, filter, and visualize — like Datasette. You can also edit records, manage
relationships, and curate data — like React Admin. One tool, both modes.

## Design principles

**Self-contained.** Tapemark ships as a single dependency with no framework lock-in. A
zero-config CLI (`npx tapemark serve`) gets you from database file to running UI instantly.
Framework adapters (Hono, etc.) let you embed it in existing applications.

**SQLite-native.** SQLite is the database. Not an abstraction over many backends — SQLite
specifically, with all its strengths: single-file databases, zero-daemon deployment, edge
compatibility (D1, Turso, libSQL). The schema is the source of truth.

**Pluggable.** Core ships with sensible defaults, but everything beyond the basics is a
plugin. Custom display types, field widgets, actions, pages — plugins extend Tapemark
without forking it.

**Server-rendered, progressively enhanced.** Tapemark is not a SPA. Pages are generated
server-side as Preact JSX, rendered to HTML, and sent as full documents. Client-side
interactivity is layered on top through web components — small, scoped, framework-free.
No client router, no hydration, no bundle. The browser does what browsers are good at;
custom elements handle the rest.

**Syncable.** Databases move. Pull a remote database locally for development. Push local
changes to production. Sync across edges. Tapemark treats sync as a first-class operation,
not an afterthought.

## Aesthetic

Retro terminal. Blade Runner interfaces. Video game HUDs. The UI leans into the look of
systems designed to be functional under pressure — dense, glowing, readable. Not minimal
startup SaaS; not Material Design. A tool that looks like it belongs in a control room.

## Lineage

Tapemark was extracted from the admin panel prototype built for [jvelo.at](https://jvelo.at).
That prototype proved the concept: a Preact-rendered, server-side UI with custom web
components, wired to SQLite via Hono and Cloudflare D1. Tapemark generalizes that into a
standalone, framework-agnostic library.
