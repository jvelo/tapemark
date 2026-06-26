/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { TapemarkLayout } from "../components/TapemarkLayout";
import { RowForm } from "../components/RowForm";
import { Flash } from "../components/Flash";
import { renderPage } from "../render";
import { SchemaIntrospector } from "../schema";
import { ConfigStore, orderColumns } from "../config";
import { NotFoundError } from "../errors";
import { castValue } from "../repository";
import { fireAfterDelete, fireAfterUpdate, flashForHookResult } from "../hooks";
import { assertWritable } from "./guard";
import { redirect } from "./response";
import type { CellValue, RowPatch, TapemarkContext, TapemarkRequest, TapemarkResponse } from "../types";

function pkValuesFromRow(
  primaryKey: string[],
  row: Record<string, CellValue>,
): Record<string, string> | null {
  if (primaryKey.length === 0) return null;
  const result: Record<string, string> = {};
  for (const col of primaryKey) {
    const v = row[col];
    if (v === null || v === undefined) return null;
    result[col] = String(v);
  }
  return result;
}

async function getRowByIndex(
  ctx: TapemarkContext,
  table: string,
  index: number,
  hasRowid: boolean,
): Promise<Record<string, CellValue>> {
  const query = hasRowid
    ? `SELECT rowid AS _rowid, * FROM "${table}" LIMIT 1 OFFSET ?`
    : `SELECT * FROM "${table}" LIMIT 1 OFFSET ?`;

  const rows = await ctx.db
    .prepare(query)
    .bind(index)
    .all<Record<string, CellValue>>();

  if (rows.length === 0) {
    throw new NotFoundError("Row not found");
  }
  return rows[0];
}

export async function rowViewRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;
  const index = parseInt(req.params.index, 10);

  if (Number.isNaN(index) || index < 0) {
    throw new NotFoundError("Invalid row index");
  }

  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(table);
  const configStore = new ConfigStore(ctx.db);
  const tableConfig = await configStore.getTableConfig(table);
  const row = await getRowByIndex(ctx, table, index, tableInfo.hasRowid);

  const isView = tableInfo.kind === "view";
  const isReadonly = isView || ctx.readonly || ctx.tableOptions.get(table)?.readonly;

  const crumbs = [
    { label: "tables", href: ctx.prefix || "/" },
    { label: table, href: `${ctx.prefix}/${table}` },
    { label: `row ${index}` },
  ];

  const html = renderPage(
    <TapemarkLayout
      title={`${table} / row ${index}`}
      prefix={ctx.prefix}
      name={ctx.name}
      symbol={ctx.symbol}
      siteUrl={ctx.siteUrl}
      siteName={ctx.siteName}
      crumbs={crumbs}
      scripts={ctx.scripts}
    >
      <Flash type={req.query.flash} message={req.query.msg} />
      <h2 class="tm-section-title">
        {isReadonly ? "view row" : "edit row"}
      </h2>
      <RowForm
        columns={orderColumns(tableInfo.columns, tableConfig)}
        primaryKey={tableInfo.primaryKey}
        hasRowid={tableInfo.hasRowid}
        foreignKeys={tableInfo.foreignKeys}
        values={row}
        action={`${ctx.prefix}/${table}/_row/${index}`}
        submitLabel="save"
        formId={isReadonly ? undefined : "tm-edit-form"}
        formReadonly={isReadonly}
        tableConfig={tableConfig}
        constraints={ctx.constraints}
        displayTypes={ctx.displayTypes}
        prefix={ctx.prefix}
      />
      {!isReadonly && (
        <div class="tm-row-actions">
          <button type="submit" form="tm-edit-form" class="tm-btn tm-btn-primary">
            save
          </button>
          <form
            method="post"
            action={`${ctx.prefix}/${table}/_row/${index}/delete`}
            class="tm-delete-inline"
          >
            <tm-confirm-button data-message={`delete row ${index}?`}>
              <button type="submit" class="tm-btn tm-btn-danger">
                delete row
              </button>
            </tm-confirm-button>
          </form>
        </div>
      )}
    </TapemarkLayout>,
  );

  return {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    html,
  };
}

export async function rowViewUpdateRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;
  const index = parseInt(req.params.index, 10);
  assertWritable(table, ctx);

  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(table);

  // Fetch the current row to get rowid for WHERE clause
  const originalRow = await getRowByIndex(ctx, table, index, tableInfo.hasRowid);
  const rowid = originalRow._rowid;

  // Build SET clause from form data
  const columnMap = new Map(tableInfo.columns.map((c) => [c.name, c]));
  const entries = Object.entries(req.body ?? {}).filter(
    ([key]) => columnMap.has(key),
  );
  const setClause = entries.map(([k]) => `"${k}" = ?`).join(", ");
  const setValues = entries.map(([k, v]) =>
    castValue(String(v), columnMap.get(k)!),
  );

  if (rowid !== undefined && rowid !== null) {
    // Use rowid for the update — most reliable
    await ctx.db
      .prepare(`UPDATE "${table}" SET ${setClause} WHERE rowid = ?`)
      .bind(...setValues, rowid)
      .run();
  } else {
    // Fallback for WITHOUT ROWID tables: match all original column values
    const whereCols = tableInfo.columns.map((c) => `"${c.name}" IS ?`).join(" AND ");
    const whereValues = tableInfo.columns.map((c) => originalRow[c.name] ?? null);
    await ctx.db
      .prepare(`UPDATE "${table}" SET ${setClause} WHERE ${whereCols}`)
      .bind(...setValues, ...whereValues)
      .run();
  }

  const pkValues = pkValuesFromRow(tableInfo.primaryKey, originalRow);
  const patch: RowPatch = {};
  entries.forEach(([k], i) => {
    patch[k] = setValues[i];
  });
  const hookError = pkValues
    ? await fireAfterUpdate(table, pkValues, patch, ctx, req)
    : null;
  const { flash, message } = flashForHookResult("row updated", hookError);

  return redirect(
    `${ctx.prefix}/${table}/_row/${index}?flash=${flash}&msg=${encodeURIComponent(message)}`,
  );
}

export async function rowViewDeleteRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;
  assertWritable(table, ctx);
  const index = parseInt(req.params.index, 10);

  // Fetch row to get rowid
  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(table);
  const originalRow = await getRowByIndex(ctx, table, index, tableInfo.hasRowid);
  const rowid = originalRow._rowid;

  if (rowid !== undefined && rowid !== null) {
    await ctx.db
      .prepare(`DELETE FROM "${table}" WHERE rowid = ?`)
      .bind(rowid)
      .run();
  } else {
    // Fallback for WITHOUT ROWID tables: match all original column values
    const whereCols = tableInfo.columns.map((c) => `"${c.name}" IS ?`).join(" AND ");
    const whereValues = tableInfo.columns.map((c) => originalRow[c.name] ?? null);
    await ctx.db
      .prepare(`DELETE FROM "${table}" WHERE ${whereCols}`)
      .bind(...whereValues)
      .run();
  }

  const pkValues = pkValuesFromRow(tableInfo.primaryKey, originalRow);
  const hookError = pkValues
    ? await fireAfterDelete(table, pkValues, ctx, req)
    : null;
  const { flash, message } = flashForHookResult("row deleted", hookError);

  return redirect(
    `${ctx.prefix}/${table}?flash=${flash}&msg=${encodeURIComponent(message)}`,
  );
}
