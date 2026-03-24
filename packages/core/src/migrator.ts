import { computeHash } from "./hash";
import type { Database } from "./types";

/**
 * Current schema version for tapemark's internal tables.
 * Increment this when adding migrations.
 */
const CURRENT_VERSION = 1;

/**
 * Manages tapemark's own tables (_tapemark_meta, _tapemark_table_config).
 * Auto-creates on first use, applies pending migrations on schema upgrades.
 */
export class TapemarkMigrator {
  private initialized = false;

  constructor(
    private db: Database,
    private readonly readonlyMode = false,
  ) {}

  /** Ensure tapemark tables exist and are up to date. Idempotent. */
  async ensureReady(): Promise<void> {
    if (this.initialized) return;

    // In readonly mode, skip all writes — tapemark tables may not exist
    if (this.readonlyMode) {
      this.initialized = true;
      return;
    }

    const hasMetaTable = await this.tableExists("_tapemark_meta");

    if (!hasMetaTable) {
      await this.createInitialSchema();
    } else {
      const version = await this.getSchemaVersion();
      if (version < CURRENT_VERSION) {
        await this.applyMigrations(version);
      }
    }

    await this.updateAppSchemaHash();
    this.initialized = true;
  }

  /** Reset initialized flag (useful after config writes that may change state). */
  resetInitialized(): void {
    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async tableExists(name: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .bind(name)
      .first<{ name: string }>();
    return row !== null;
  }

  private async createInitialSchema(): Promise<void> {
    await this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS _tapemark_meta (
          key TEXT PRIMARY KEY,
          value TEXT
        )`,
      )
      .run();

    await this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS _tapemark_table_config (
          table_name TEXT PRIMARY KEY,
          config TEXT NOT NULL DEFAULT '{}'
        )`,
      )
      .run();

    await this.db
      .prepare(
        "INSERT OR REPLACE INTO _tapemark_meta (key, value) VALUES ('schema_version', ?)",
      )
      .bind(String(CURRENT_VERSION))
      .run();
  }

  private async getSchemaVersion(): Promise<number> {
    const row = await this.db
      .prepare(
        "SELECT value FROM _tapemark_meta WHERE key = 'schema_version'",
      )
      .first<{ value: string }>();
    return row ? parseInt(row.value, 10) : 0;
  }

  private async applyMigrations(fromVersion: number): Promise<void> {
    // Future migrations go here as a version switch:
    // if (fromVersion < 2) { ... }
    // if (fromVersion < 3) { ... }
    void fromVersion;

    await this.db
      .prepare(
        "INSERT OR REPLACE INTO _tapemark_meta (key, value) VALUES ('schema_version', ?)",
      )
      .bind(String(CURRENT_VERSION))
      .run();
  }

  private async updateAppSchemaHash(): Promise<void> {
    const rows = await this.db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name",
      )
      .all<{ sql: string }>();

    const concatenated = rows.map((r) => r.sql).join("\n");
    const hash = await computeHash(concatenated);

    await this.db
      .prepare(
        "INSERT OR REPLACE INTO _tapemark_meta (key, value) VALUES ('app_schema_hash', ?)",
      )
      .bind(hash)
      .run();
  }
}

