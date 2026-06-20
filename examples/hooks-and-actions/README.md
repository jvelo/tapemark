# Hooks & custom actions example

A task list (`tasks`) wired up with hooks that write to an audit log (`task_events`) on every insert/update/delete, plus row actions: a grouped `status ▾` dropdown, `clear notes`, and `duplicate`.

```bash
pnpm --filter @jvelo/tapemark-example-hooks-and-actions dev
# → http://localhost:3334
```

The shape lives in [`serve.ts`](./serve.ts):

```ts
tables: {
  tasks: {
    hooks: {
      afterInsert: async (row, ctx) => { /* … */ },
      afterUpdate: async (pk, patch, ctx) => { /* … */ },
      afterDelete: async (pk, ctx) => { /* … */ },
    },
    actions: {
      // Declares the column it owns and writes through ctx.updateOwned, so it
      // only ever touches `status` — never the `notes` that `clear_notes` owns.
      mark_done: {
        label: "mark done",
        group: "status",
        display: { list: true },
        writes: ["status"],
        handler: async (pk, ctx) => { await ctx.updateOwned({ status: "done" }); /* … */ },
      },
      clear_notes: {
        label: "clear notes",
        writes: ["notes"],
        handler: async (pk, ctx) => { await ctx.updateOwned({ notes: null }); /* … */ },
      },
      // No `writes` — an insert, so it stays free-form raw SQL.
      duplicate: { label: "duplicate", handler: async (pk, ctx) => { /* … */ } },
    },
  },
},
```

`writes` + `ctx.updateOwned` scope an action's writes to the columns it declares: the call updates the row in place, touching only the keys you pass, and throws on a column outside `writes`, a column the table doesn't have, or a missing row — so sibling actions sharing a table can't clobber each other and typos fail loudly.
