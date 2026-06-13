/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { Database, PreparedStatement } from "@jvelo/tapemark";

/**
 * Cloudflare D1 database shape. D1 is a runtime API — there's no npm
 * package to import. This interface matches what `c.env.DB` provides.
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all(): Promise<{ results: Record<string, unknown>[] }>;
  first(): Promise<Record<string, unknown> | null>;
  run(): Promise<void>;
}

/**
 * Wraps a Cloudflare D1 database to match tapemark's Database interface.
 * D1 already matches closely — the only difference is `all()` returns
 * `{ results: T[] }` which we unwrap to `T[]`.
 */
export function createD1Adapter(d1: D1Database): Database {
  return {
    prepare(query: string): PreparedStatement {
      let stmt = d1.prepare(query);
      const wrapped: PreparedStatement = {
        bind(...values: unknown[]) {
          stmt = stmt.bind(...values);
          return wrapped;
        },
        async all<T>() {
          const result = await (stmt as D1PreparedStatement).all();
          return result.results as T[];
        },
        async first<T>() {
          return (await (stmt as D1PreparedStatement).first()) as T | null;
        },
        async run() {
          await (stmt as D1PreparedStatement).run();
        },
      };

      return wrapped;
    },
  };
}
