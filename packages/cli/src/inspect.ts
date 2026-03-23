import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { defineCommand } from "citty";
import BetterSqlite3 from "better-sqlite3";
import { createSqliteAdapter } from "@jvelo/tapemark-better-sqlite3";
import { SchemaIntrospector } from "@jvelo/tapemark";

export const inspectCommand = defineCommand({
  meta: {
    name: "inspect",
    description: "Inspect SQLite database schema",
  },
  args: {
    table: {
      type: "string",
      description: "Show schema for a specific table",
    },
    diff: {
      type: "string",
      description: "Compare schema with another database file",
    },
    _: {
      type: "positional",
      description: "SQLite file path",
      required: true,
    },
  },
  async run({ args }) {
    const filePath = resolve(String(args._));
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    const raw = new BetterSqlite3(filePath, { readonly: true });
    const db = createSqliteAdapter(raw);
    const introspector = new SchemaIntrospector(db);

    if (args.diff) {
      await diffSchemas(introspector, args.diff);
      raw.close();
      return;
    }

    if (args.table) {
      await showTable(introspector, args.table);
      raw.close();
      return;
    }

    // Default: list all tables
    await listTables(introspector);
    raw.close();
  },
});

async function listTables(introspector: SchemaIntrospector): Promise<void> {
  const tables = await introspector.getTables();

  if (tables.length === 0) {
    console.log("No tables found.");
    return;
  }

  // Calculate column widths
  const nameWidth = Math.max(5, ...tables.map((t) => t.name.length));
  const rowsWidth = Math.max(4, ...tables.map((t) => String(t.rowCount).length));
  const colsWidth = Math.max(4, ...tables.map((t) => String(t.columns.length).length));

  console.log(
    pad("TABLE", nameWidth) + "  " +
    padLeft("ROWS", rowsWidth) + "  " +
    padLeft("COLS", colsWidth),
  );
  console.log("-".repeat(nameWidth + rowsWidth + colsWidth + 4));

  for (const table of tables) {
    console.log(
      pad(table.name, nameWidth) + "  " +
      padLeft(String(table.rowCount), rowsWidth) + "  " +
      padLeft(String(table.columns.length), colsWidth),
    );
  }

  const schema = await introspector.getSchema();
  console.log(`\n${tables.length} tables, schema hash: ${schema.hash.slice(0, 12)}…`);
}

async function showTable(
  introspector: SchemaIntrospector,
  tableName: string,
): Promise<void> {
  const table = await introspector.getTable(tableName);

  console.log(`${table.name} (${table.rowCount} rows)\n`);

  const nameWidth = Math.max(6, ...table.columns.map((c) => c.name.length));
  const typeWidth = Math.max(4, ...table.columns.map((c) => (c.rawType || "").length));

  console.log(
    pad("COLUMN", nameWidth) + "  " +
    pad("TYPE", typeWidth) + "  " +
    "FLAGS",
  );
  console.log("-".repeat(nameWidth + typeWidth + 20));

  for (const col of table.columns) {
    const flags: string[] = [];
    if (col.primaryKeyPosition !== null) flags.push(`PK(${col.primaryKeyPosition})`);
    if (!col.nullable) flags.push("NOT NULL");
    if (col.defaultValue !== null) flags.push(`DEFAULT ${col.defaultValue}`);

    console.log(
      pad(col.name, nameWidth) + "  " +
      pad(col.rawType || "(none)", typeWidth) + "  " +
      flags.join(", "),
    );
  }

  if (table.primaryKey.length > 0) {
    console.log(`\nPrimary key: ${table.primaryKey.join(", ")}`);
  }
}

async function diffSchemas(
  introspector: SchemaIntrospector,
  otherPath: string,
): Promise<void> {
  const absOther = resolve(otherPath);
  if (!existsSync(absOther)) {
    console.error(`File not found: ${absOther}`);
    process.exit(1);
  }

  const otherRaw = new BetterSqlite3(absOther, { readonly: true });
  const otherDb = createSqliteAdapter(otherRaw);
  const otherIntrospector = new SchemaIntrospector(otherDb);

  const schema1 = await introspector.getSchema();
  const schema2 = await otherIntrospector.getSchema();

  if (schema1.hash === schema2.hash) {
    console.log("Schemas are identical.");
    otherRaw.close();
    return;
  }

  console.log("Schemas differ.\n");

  const names1 = new Set(schema1.tables.map((t) => t.name));
  const names2 = new Set(schema2.tables.map((t) => t.name));

  // Tables only in source
  for (const name of names1) {
    if (!names2.has(name)) {
      console.log(`+ ${name} (only in source)`);
    }
  }

  // Tables only in target
  for (const name of names2) {
    if (!names1.has(name)) {
      console.log(`- ${name} (only in target)`);
    }
  }

  // Tables in both — compare columns
  for (const t1 of schema1.tables) {
    const t2 = schema2.tables.find((t) => t.name === t1.name);
    if (!t2) continue;

    const cols1 = new Map(t1.columns.map((c) => [c.name, c]));
    const cols2 = new Map(t2.columns.map((c) => [c.name, c]));

    const diffs: string[] = [];
    for (const [name, col] of cols1) {
      if (!cols2.has(name)) {
        diffs.push(`  + ${name} (only in source)`);
      } else {
        const other = cols2.get(name)!;
        if (col.rawType !== other.rawType) {
          diffs.push(`  ~ ${name}: ${col.rawType} → ${other.rawType}`);
        }
      }
    }
    for (const name of cols2.keys()) {
      if (!cols1.has(name)) {
        diffs.push(`  - ${name} (only in target)`);
      }
    }

    if (diffs.length > 0) {
      console.log(`\n${t1.name}:`);
      diffs.forEach((d) => console.log(d));
    }
  }

  console.log(`\nSource hash: ${schema1.hash.slice(0, 12)}…`);
  console.log(`Target hash: ${schema2.hash.slice(0, 12)}…`);

  otherRaw.close();
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function pad(str: string, width: number): string {
  return str + " ".repeat(Math.max(0, width - str.length));
}

function padLeft(str: string, width: number): string {
  return " ".repeat(Math.max(0, width - str.length)) + str;
}
