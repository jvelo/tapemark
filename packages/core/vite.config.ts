/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { copyFileSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const fontsDepartContent = readFileSync("src/assets/fonts-depart.css", "utf-8");
const fontsPlexContent = readFileSync("src/assets/fonts-plex.css", "utf-8");
const fontsHubotContent = readFileSync("src/assets/fonts-hubot.css", "utf-8");
const cssContent = readFileSync("src/assets/tapemark.css", "utf-8");
const jsContent = readFileSync("src/assets/tapemark.js", "utf-8");

export default defineConfig({
  plugins: [
    dts({ rollupTypes: true }),
    {
      name: "inline-assets",
      transform(code, id) {
        // Replace the loadAsset module with inlined content at build time
        if (id.endsWith("assets/load.ts")) {
          return {
            code: `
const ASSETS = {
  "fonts-depart.css": ${JSON.stringify(fontsDepartContent)},
  "fonts-plex.css": ${JSON.stringify(fontsPlexContent)},
  "fonts-hubot.css": ${JSON.stringify(fontsHubotContent)},
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
        copyFileSync("src/assets/fonts-depart.css", "dist/fonts-depart.css");
        copyFileSync("src/assets/fonts-plex.css", "dist/fonts-plex.css");
        copyFileSync("src/assets/fonts-hubot.css", "dist/fonts-hubot.css");
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
        "hono",
        "hono/jsx",
        "hono/jsx/jsx-runtime",
        "hono/jsx/dom/server",
        "node:crypto",
      ],
    },
  },
});
