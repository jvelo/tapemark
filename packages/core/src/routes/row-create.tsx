import { TapemarkLayout } from "../components/TapemarkLayout";
import { RowForm } from "../components/RowForm";
import { renderPage } from "../render";
import { SchemaIntrospector } from "../schema";
import { TableRepository, encodePk } from "../repository";
import { ConfigStore } from "../config";
import { fireAfterInsert, flashForHookResult } from "../hooks";
import { assertWritable } from "./guard";
import { redirect } from "./response";
import type { TapemarkContext, TapemarkRequest, TapemarkResponse } from "../types";

export async function rowCreateRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;

  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(table);
  const configStore = new ConfigStore(ctx.db);
  const tableConfig = await configStore.getTableConfig(table);

  const crumbs = [
    { label: "tables", href: ctx.prefix || "/" },
    { label: table, href: `${ctx.prefix}/${table}` },
    { label: "new" },
  ];

  const html = renderPage(
    <TapemarkLayout
      title={`${table} / new`}
      prefix={ctx.prefix}
      name={ctx.name}
      symbol={ctx.symbol}
      siteUrl={ctx.siteUrl} siteName={ctx.siteName}
      crumbs={crumbs}
      scripts={ctx.scripts}
    >
      <h2 class="tm-section-title">new row</h2>
      <RowForm
        columns={tableInfo.columns}
        primaryKey={tableInfo.primaryKey}
        hasRowid={tableInfo.hasRowid}
        foreignKeys={tableInfo.foreignKeys}
        action={`${ctx.prefix}/${table}/new`}
        submitLabel="create"
        tableConfig={tableConfig}
        constraints={ctx.constraints}
        displayTypes={ctx.displayTypes}
        prefix={ctx.prefix}
      />
    </TapemarkLayout>,
  );

  return {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    html,
  };
}

export async function rowInsertRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;
  assertWritable(table, ctx);

  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(table);
  const repo = new TableRepository(ctx.db);

  const data: Record<string, string> = {};
  if (req.body) {
    for (const col of tableInfo.columns) {
      if (col.name in req.body) {
        data[col.name] = String(req.body[col.name]);
      }
    }
  }

  const insertedRow = await repo.insertRow(table, data);

  const hookError = await fireAfterInsert(table, insertedRow, ctx, req);
  const { flash, message } = flashForHookResult("row created", hookError);

  const pk = encodePk(tableInfo.primaryKey, insertedRow);
  return redirect(
    `${ctx.prefix}/${table}/${pk}?flash=${flash}&msg=${encodeURIComponent(message)}`,
  );
}
