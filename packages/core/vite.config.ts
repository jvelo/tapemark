import { copyFileSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import dts from "vite-plugin-dts";

const fontsContent = readFileSync("src/assets/fonts.css", "utf-8");
const cssContent = readFileSync("src/assets/tapemark.css", "utf-8");
const jsContent = readFileSync("src/assets/tapemark.js", "utf-8");

export default defineConfig({
  plugins: [
    preact(),
    dts({ rollupTypes: true }),
    {
      name: "inline-assets",
      transform(code, id) {
        // Replace the loadAsset module with inlined content at build time
        if (id.endsWith("assets/load.ts")) {
          return {
            code: `
const ASSETS = {
  "fonts.css": ${JSON.stringify(fontsContent)},
  "tapemark.css": ${JSON.stringify(cssContent)},
  "tapemark.js": ${JSON.stringify(jsContent)},
};
export function loadAsset(filename) {
  return ASSETS[filename] || "";
}
`,
            map: null,
          };
        }
      },
      closeBundle() {
        // Also copy raw files for Node.js fs.readFileSync fallback
        copyFileSync("src/assets/fonts.css", "dist/fonts.css");
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
        "node:crypto",
      ],
    },
  },
});
