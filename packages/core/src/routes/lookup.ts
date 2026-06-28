/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { SchemaIntrospector } from "../schema";
import type { TapemarkContext, TapemarkRequest, TapemarkResponse } from "../types";

const LABEL_CANDIDATES = [
  "name", "title", "label", "displayname", "username",
  "email", "subject", "slug", "filename", "url", "code",
  "description",
];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function normalize(s: string): string {
  return s.toLowerCase().replace(/_/g, "");
}

export function pickLabelColumn(
  table: Awaited<ReturnType<SchemaIntrospector["getTable"]>>,
): string | null {
  const pkSet = new Set(table.primaryKey);
  const textColumns = table.columns.filter(
    (c) => c.affinity === "text" && !pkSet.has(c.name),
  );

  for (const candidate of LABEL_CANDIDATES) {
    const match = textColumns.find((c) => normalize(c.name) === candidate);
    if (match) return match.name;
  }

  return textColumns[0]?.name ?? null;
}

export async function lookupRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const tableName = decodeURIComponent(req.params.table);
  const q = req.query.q ?? "";
  const valueFilter = req.query.value;
  const limitParam = parseInt(req.query.limit ?? String(DEFAULT_LIMIT), 10);
  const limit = Math.min(Math.max(1, limitParam), MAX_LIMIT);
  const offsetParam = parseInt(req.query.offset ?? "0", 10);
  const offset = Math.max(0, offsetParam);
  const labelColumnOverride = req.query.label;

  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(tableName);

  if (tableInfo.primaryKey.length === 0) {
    return {
      status: 400,
      headers: { "content-type": "application/json" },
      html: JSON.stringify({ error: "table has no primary key" }),
    };
  }

  if (labelColumnOverride !== undefined) {
    await introspector.assertColumn(tableName, labelColumnOverride);
  }

  const labelColumn = labelColumnOverride ?? pickLabelColumn(tableInfo);
  const valueColumn = tableInfo.primaryKey[0];

  const selectCols = [`"${valueColumn}" as value`];
  if (labelColumn && labelColumn !== valueColumn) {
    selectCols.push(`"${labelColumn}" as label`);
  }

  // Direct value lookup — returns a single result by PK
  if (valueFilter) {
    const sql = `SELECT ${selectCols.join(", ")} FROM "${tableName}" WHERE "${valueColumn}" = ?`;
    const rows = await ctx.db.prepare(sql).bind(valueFilter).all<{ value: unknown; label?: unknown }>();
    const results = rows.map((row) => ({
      value: row.value,
      label: row.label !== undefined ? String(row.label) : String(row.value),
    }));
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      html: JSON.stringify({ results, total: results.length }),
    };
  }

  // Search query
  let whereSql = "";
  let whereBinds: unknown[] = [];

  if (q && labelColumn) {
    whereSql = `WHERE "${labelColumn}" LIKE ?`;
    whereBinds = [`%${q}%`];
  } else if (q) {
    whereSql = `WHERE CAST("${valueColumn}" AS TEXT) LIKE ?`;
    whereBinds = [`%${q}%`];
  }

  const countRow = await ctx.db
    .prepare(`SELECT COUNT(*) as cnt FROM "${tableName}" ${whereSql}`)
    .bind(...whereBinds)
    .first<{ cnt: number }>();
  const total = countRow?.cnt ?? 0;

  const sql = `SELECT ${selectCols.join(", ")} FROM "${tableName}" ${whereSql} LIMIT ? OFFSET ?`;
  const rows = await ctx.db.prepare(sql).bind(...whereBinds, limit, offset).all<{ value: unknown; label?: unknown }>();

  const results = rows.map((row) => ({
    value: row.value,
    label: row.label !== undefined ? String(row.label) : String(row.value),
  }));

  return {
    status: 200,
    headers: { "content-type": "application/json" },
    html: JSON.stringify({ results, total }),
  };
}
