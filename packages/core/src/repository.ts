import { NotFoundError, ValidationError } from "./errors";
import { SchemaIntrospector } from "./schema";
import type { CellValue, Column, Database, RowResult } from "./types";

// ---------------------------------------------------------------------------
// PK encoding / decoding for URLs
// ---------------------------------------------------------------------------

export function encodePk(
  primaryKey: string[],
  row: Record<string, unknown>,
): string {
  return primaryKey
    .map((col) => encodeURIComponent(String(row[col] ?? "")))
    .join(",");
}

export function decodePk(
  primaryKey: string[],
  encoded: string,
): Record<string, string> {
  const parts = encoded.split(",").map(decodeURIComponent);
  const result: Record<string, string> = {};
  for (let i = 0; i < primaryKey.length; i++) {
    result[primaryKey[i]] = parts[i] ?? "";
  }
  return result;
}

// ---------------------------------------------------------------------------
// Value casting
// ---------------------------------------------------------------------------

export function castValue(value: string, column: Column): CellValue {
  if (value === "" && column.nullable) return null;
  if (
    column.affinity === "integer" ||
    column.affinity === "real" ||
    column.affinity === "numeric"
  ) {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  return value;
}

// ---------------------------------------------------------------------------
// TableRepository
// ---------------------------------------------------------------------------

export class TableRepository {
  private schema: SchemaIntrospector;

  constructor(private db: Database) {
    this.schema = new SchemaIntrospector(db);
  }

  /** Paginated row listing. */
  async getRows(
    tableName: string,
    page: number = 1,
    pageSize: number = 50,
  ): Promise<RowResult> {
    const table = await this.schema.getTable(tableName);
    const offset = (page - 1) * pageSize;

    const countRow = await this.db
      .prepare(`SELECT COUNT(*) as cnt FROM "${tableName}"`)
      .first<{ cnt: number }>();
    const total = countRow?.cnt ?? 0;

    const rows = await this.db
      .prepare(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`)
      .bind(pageSize, offset)
      .all();

    return {
      columns: table.columns,
      rows: rows as Record<string, CellValue>[],
      total,
      page,
      pageSize,
    };
  }

  /** Single row by primary key values. */
  async getRow(
    tableName: string,
    pkValues: Record<string, string>,
  ): Promise<Record<string, CellValue>> {
    const table = await this.schema.getTable(tableName);
    if (table.primaryKey.length === 0) {
      throw new ValidationError(
        `Table "${tableName}" has no primary key`,
      );
    }

    const where = pkWhere(table.primaryKey);
    const binds = table.primaryKey.map((col) => pkValues[col]);

    const row = await this.db
      .prepare(`SELECT * FROM "${tableName}" WHERE ${where}`)
      .bind(...binds)
      .first();

    if (!row) {
      throw new NotFoundError(
        `Row not found in "${tableName}"`,
        `PK: ${JSON.stringify(pkValues)}`,
      );
    }

    return row as Record<string, CellValue>;
  }

  /** Insert a new row. Empty-string values for columns not in data are skipped. */
  async insertRow(
    tableName: string,
    data: Record<string, string>,
  ): Promise<void> {
    const table = await this.schema.getTable(tableName);
    const columnMap = new Map(table.columns.map((c) => [c.name, c]));

    const entries = Object.entries(data).filter(
      ([key, val]) => columnMap.has(key) && val !== "",
    );

    if (entries.length === 0) {
      throw new ValidationError("No valid columns to insert");
    }

    const cols = entries.map(([k]) => `"${k}"`).join(", ");
    const placeholders = entries.map(() => "?").join(", ");
    const values = entries.map(([k, v]) => castValue(v, columnMap.get(k)!));

    await this.db
      .prepare(
        `INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders})`,
      )
      .bind(...values)
      .run();
  }

  /** Update a row. PK columns in data are ignored. */
  async updateRow(
    tableName: string,
    pkValues: Record<string, string>,
    data: Record<string, string>,
  ): Promise<void> {
    const table = await this.schema.getTable(tableName);
    const pkSet = new Set(table.primaryKey);
    const columnMap = new Map(table.columns.map((c) => [c.name, c]));

    const entries = Object.entries(data).filter(
      ([key]) => columnMap.has(key) && !pkSet.has(key),
    );

    if (entries.length === 0) {
      throw new ValidationError("No valid columns to update");
    }

    const setClause = entries.map(([k]) => `"${k}" = ?`).join(", ");
    const setValues = entries.map(([k, v]) =>
      castValue(v, columnMap.get(k)!),
    );
    const whereBinds = table.primaryKey.map((col) => pkValues[col]);

    await this.db
      .prepare(
        `UPDATE "${tableName}" SET ${setClause} WHERE ${pkWhere(table.primaryKey)}`,
      )
      .bind(...setValues, ...whereBinds)
      .run();
  }

  /** Delete a single row by primary key. */
  async deleteRow(
    tableName: string,
    pkValues: Record<string, string>,
  ): Promise<void> {
    const table = await this.schema.getTable(tableName);
    if (table.primaryKey.length === 0) {
      throw new ValidationError(
        `Table "${tableName}" has no primary key`,
      );
    }

    const whereBinds = table.primaryKey.map((col) => pkValues[col]);

    await this.db
      .prepare(
        `DELETE FROM "${tableName}" WHERE ${pkWhere(table.primaryKey)}`,
      )
      .bind(...whereBinds)
      .run();
  }

  /** Distinct non-null values for a column, ordered alphabetically, capped by `limit`. */
  async getDistinctValues(
    tableName: string,
    column: string,
    limit: number = 1000,
  ): Promise<string[]> {
    const table = await this.schema.getTable(tableName);
    if (!table.columns.some((c) => c.name === column)) {
      throw new ValidationError(`Column "${column}" not found in "${tableName}"`);
    }
    const rows = await this.db
      .prepare(
        `SELECT DISTINCT "${column}" AS v FROM "${tableName}" WHERE "${column}" IS NOT NULL AND "${column}" != '' ORDER BY "${column}" LIMIT ?`,
      )
      .bind(limit)
      .all<{ v: CellValue }>();
    return rows.map((r) => String(r.v));
  }

  /** Delete multiple rows by encoded PK strings. */
  async bulkDelete(
    tableName: string,
    encodedPks: string[],
  ): Promise<number> {
    const table = await this.schema.getTable(tableName);
    if (table.primaryKey.length === 0) {
      throw new ValidationError(
        `Table "${tableName}" has no primary key`,
      );
    }

    let deleted = 0;
    for (const encoded of encodedPks) {
      const pkValues = decodePk(table.primaryKey, encoded);
      await this.db
        .prepare(
          `DELETE FROM "${tableName}" WHERE ${pkWhere(table.primaryKey)}`,
        )
        .bind(...table.primaryKey.map((col) => pkValues[col]))
        .run();
      deleted++;
    }
    return deleted;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pkWhere(primaryKey: string[]): string {
  return primaryKey.map((col) => `"${col}" = ?`).join(" AND ");
}
