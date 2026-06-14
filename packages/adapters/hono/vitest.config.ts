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
  },
  resolve: {
    alias: {
      "@jvelo/tapemark-better-sqlite3": path.resolve(
        __dirname,
        "../../../packages/db-adapters/better-sqlite3/src/index.ts",
      ),
      "@jvelo/tapemark": path.resolve(
        __dirname,
        "../../../packages/core/src/index.ts",
      ),
    },
  },
});
