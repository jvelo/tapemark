/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    css: {
      include: [/.*/],
    },
    // Each `it` spawns `npx tsx` via execSync; cold-start on CI can exceed
    // vitest's 5s default for the first call. Match the inner execSync timeout.
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      "@jvelo/tapemark-better-sqlite3": path.resolve(
        __dirname,
        "../db-adapters/better-sqlite3/src/index.ts",
      ),
      "@jvelo/tapemark": path.resolve(
        __dirname,
        "../core/src/index.ts",
      ),
    },
  },
});
