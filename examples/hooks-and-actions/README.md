# Hooks & custom actions example

Demonstrates the two extension points introduced alongside the core CRUD routes:

- **Lifecycle hooks** (`afterInsert` / `afterUpdate` / `afterDelete`) — automatic side effects whenever a row changes through Tapemark.
- **Custom row actions** — named operations rendered as buttons on the row detail page, dispatched to server-side handlers.

## Run it

```bash
pnpm --filter @jvelo/tapemark-example-hooks-and-actions dev
```

Open http://localhost:3334.

## What's in the demo

Two tables:

| Table         | Purpose                                                            |
|---------------|--------------------------------------------------------------------|
| `tasks`       | A small to-do list with `title`, `status`, `notes`                 |
| `task_events` | Audit log populated automatically by hooks                         |

### Hooks

On the `tasks` table:

- `afterInsert` → logs a `created` event with the title.
- `afterUpdate` → logs an `updated` event noting which fields changed.
- `afterDelete` → logs a `deleted` event.

Try creating, editing, or deleting rows in `/tasks`, then browse `/task_events` to see entries appear.

### Actions

On the `tasks` table detail page you'll see two buttons beyond save/delete:

- **mark done** — sets `status = 'done'` and writes an event.
- **duplicate** — inserts a cloned row with `(copy)` in the title.

Both return a flash message describing what happened.

## Reading the code

Everything lives in [`serve.ts`](./serve.ts). The interesting block is the `tables.tasks` entry passed to `createTapemark`:

```ts
tables: {
  tasks: {
    hooks: {
      afterInsert: async (row, ctx) => { /* … */ },
      afterUpdate: async (pk, patch, ctx) => { /* … */ },
      afterDelete: async (pk, ctx) => { /* … */ },
    },
    actions: {
      mark_done: { label: "mark done", handler: async (pk, ctx) => { /* … */ } },
      duplicate: { label: "duplicate", handler: async (pk, ctx) => { /* … */ } },
    },
  },
},
```

`ctx.db` is the same `Database` adapter Tapemark uses internally, so hook and action handlers can read or write any table. `ctx.env` and `ctx.executionCtx` are forwarded by framework adapters (e.g. Hono's `c.env` / `c.executionCtx`); here they're `undefined` because this example uses plain Node `http`.
