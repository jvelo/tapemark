import { TapemarkLayout } from "../components/TapemarkLayout";
import { RowForm } from "../components/RowForm";
import { renderPage } from "../render";
import { SchemaIntrospector } from "../schema";
import { TableRepository, encodePk } from "../repository";
import { ConfigStore } from "../config";
import { assertWritable } from "./guard";
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
      siteUrl={ctx.siteUrl} siteName={ctx.siteName}
      crumbs={crumbs}
      scripts={ctx.scripts}
    >
      <h2 class="tm-section-title">new row</h2>
      <RowForm
        columns={tableInfo.columns}
        primaryKey={tableInfo.primaryKey}
        action={`${ctx.prefix}/${table}/new`}
        submitLabel="create"
        tableConfig={tableConfig}
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

  await repo.insertRow(table, data);

  const pk = encodePk(tableInfo.primaryKey, data);
  return {
    status: 302,
    headers: { location: `${ctx.prefix}/${table}/${pk}?flash=success&msg=${encodeURIComponent("row created")}` },
    redirect: `${ctx.prefix}/${table}/${pk}?flash=success&msg=${encodeURIComponent("row created")}`,
  };
}
