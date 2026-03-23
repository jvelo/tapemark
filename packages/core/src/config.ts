import type { ColumnConfig, Database, TableConfig } from "./types";

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

    const row = await this.db
      .prepare(
        "SELECT config FROM _tapemark_table_config WHERE table_name = ?",
      )
      .bind(tableName)
      .first<{ config: string }>();

    let config: TableConfig = {};
    if (row?.config) {
      try {
        config = JSON.parse(row.config) as TableConfig;
      } catch {
        config = {};
      }
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
