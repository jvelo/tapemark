import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    css: {
      include: [/.*/],
    },
  },
  resolve: {
    alias: {
      "tapemark-better-sqlite3": path.resolve(
        __dirname,
        "../../../packages/db-adapters/better-sqlite3/src/index.ts",
      ),
      tapemark: path.resolve(
        __dirname,
        "../../../packages/core/src/index.ts",
      ),
    },
  },
});
