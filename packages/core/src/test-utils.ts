/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Test helpers — wraps better-sqlite3 via the real adapter.
 * Not shipped in the published package.
 */
import BetterSqlite3 from "better-sqlite3";
import { createSqliteAdapter } from "@jvelo/tapemark-better-sqlite3";
import type { Database } from "./types";

export function createTestDb(
  schema?: string,
): { db: Database; raw: BetterSqlite3.Database } {
  const raw = new BetterSqlite3(":memory:");
  if (schema) {
    raw.exec(schema);
  }
  return { db: createSqliteAdapter(raw), raw };
}
