import { copyFileSync } from "node:fs";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    preact(),
    dts({ rollupTypes: true }),
    {
      name: "copy-assets",
      closeBundle() {
        copyFileSync("src/assets/tapemark.css", "dist/tapemark.css");
        copyFileSync("src/assets/tapemark.js", "dist/tapemark.js");
      },
    },
  ],
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [
        "preact",
        "preact/jsx-runtime",
        "preact-render-to-string",
        "node:fs",
        "node:path",
        "node:url",
        "node:crypto",
      ],
    },
  },
});
