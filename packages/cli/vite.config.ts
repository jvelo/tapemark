/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

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
        "@jvelo/tapemark",
        "@jvelo/tapemark-better-sqlite3",
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
