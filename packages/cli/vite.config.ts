import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [
        "tapemark",
        "tapemark-better-sqlite3",
        "better-sqlite3",
        "citty",
        "node:http",
        "node:fs",
        "node:path",
        "node:url",
        "node:crypto",
        "node:process",
      ],
    },
  },
});
