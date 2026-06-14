/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { Column, ColumnConfig, Database, TableConfig } from "./types";

/**
 * Apply `config.order` to a column list for rendering. Columns listed in
 * `order` come first in the given sequence; unlisted columns trail in
 * their original (schema) order. Names in `order` that don't match a real
 * column are skipped. Duplicates in `order` only place the column once.
 *
 * Pure render concern — never use this for SQL projection or write paths.
 */
export function orderColumns(columns: Column[], config: TableConfig): Column[] {
  const order = config.order;
  if (!order || order.length === 0) return columns;

  const byName = new Map(columns.map((c) => [c.name, c]));
  const placed = new Set<string>();
  const ordered: Column[] = [];

  for (const name of order) {
    const col = byName.get(name);
    if (!col || placed.has(name)) continue;
    ordered.push(col);
    placed.add(name);
  }
  for (const col of columns) {
    if (!placed.has(col.name)) ordered.push(col);
  }
  return ordered;
}

/**
 * Reads and writes per-table display configuration from _tapemark_table_config.
 * Caches in memory; invalidates on write.
 */
export class ConfigStore {
  private cache = new Map<string, TableConfig>();

  constructor(private db: Database) {}

  async getTableConfig(tableName: string): Promise<TableConfig> {
    const cached = this.cache.get(tableName);
    if (cached) return cached;

    let config: TableConfig = {};
    try {
      const row = await this.db
        .prepare(
          "SELECT config FROM _tapemark_table_config WHERE table_name = ?",
        )
        .bind(tableName)
        .first<{ config: string }>();

      if (row?.config) {
        config = JSON.parse(row.config) as TableConfig;
      }
    } catch {
      // Table may not exist in readonly mode — return empty config
    }

    this.cache.set(tableName, config);
    return config;
  }

  async setTableConfig(
    tableName: string,
    config: TableConfig,
  ): Promise<void> {
    const json = JSON.stringify(config);
    await this.db
      .prepare(
        "INSERT INTO _tapemark_table_config (table_name, config) VALUES (?, ?) ON CONFLICT(table_name) DO UPDATE SET config = ?",
      )
      .bind(tableName, json, json)
      .run();

    // Invalidate cache for this table
    this.cache.set(tableName, config);
  }

  /** Get config for a specific column, with defaults. */
  getColumnConfig(tableConfig: TableConfig, columnName: string): ColumnConfig {
    return tableConfig.columns?.[columnName] ?? {};
  }

  /** Clear the entire cache (e.g. after migration). */
  invalidate(): void {
    this.cache.clear();
  }
}
