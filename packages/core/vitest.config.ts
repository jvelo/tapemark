import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    css: {
      include: [/.*/],
    },
  },
  resolve: {
    alias: {
      "@jvelo/tapemark-better-sqlite3": path.resolve(
        __dirname,
        "../db-adapters/better-sqlite3/src/index.ts",
      ),
    },
  },
});
