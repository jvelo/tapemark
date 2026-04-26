# Hooks & custom actions example

A task list (`tasks`) wired up with hooks that write to an audit log (`task_events`) on every insert/update/delete, plus two row actions (`mark done`, `duplicate`).

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
      mark_done: {
        label: "mark done",
        inTable: true,
        visible: (row) => row.status !== "done",
        handler: async (pk, ctx) => { /* … */ },
      },
      duplicate: { label: "duplicate", handler: async (pk, ctx) => { /* … */ } },
    },
  },
},
```
