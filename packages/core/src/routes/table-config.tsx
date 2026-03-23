import { TapemarkLayout } from "../components/TapemarkLayout";
import { ConfigForm } from "../components/ConfigForm";
import { Flash } from "../components/Flash";
import { renderPage } from "../render";
import { SchemaIntrospector } from "../schema";
import { ConfigStore } from "../config";
import type {
  ColumnConfig,
  TableConfig,
  TapemarkContext,
  TapemarkRequest,
  TapemarkResponse,
} from "../types";

export async function tableConfigRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;

  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(table);
  const configStore = new ConfigStore(ctx.db);
  const config = await configStore.getTableConfig(table);

  const crumbs = [
    { label: "tables", href: ctx.prefix || "/" },
    { label: table, href: `${ctx.prefix}/${table}` },
    { label: "config" },
  ];

  const html = renderPage(
    <TapemarkLayout
      title={`${table} config`}
      prefix={ctx.prefix}
      name={ctx.name}
      siteUrl={ctx.siteUrl}
      crumbs={crumbs}
      scripts={ctx.scripts}
    >
      <Flash type={req.query.flash} message={req.query.msg} />
      <h2 class="tm-section-title">
        {table} — display config
      </h2>
      <ConfigForm
        table={table}
        prefix={ctx.prefix}
        columns={tableInfo.columns}
        config={config}
        displayTypes={ctx.displayTypes}
      />
    </TapemarkLayout>,
  );

  return {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    html,
  };
}

export async function tableConfigUpdateRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;

  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(table);
  const configStore = new ConfigStore(ctx.db);

  const config: TableConfig = { columns: {} };

  if (req.body) {
    for (const col of tableInfo.columns) {
      const display =
        (req.body[`${col.name}__display`] as string) || "text";
      const label =
        (req.body[`${col.name}__label`] as string) || "";
      const hidden = !!req.body[`${col.name}__hidden`];

      const cc: ColumnConfig = {};
      if (display !== "text") cc.display = display;
      if (label) cc.label = label;
      if (hidden) cc.hidden = true;

      if (Object.keys(cc).length > 0) {
        config.columns![col.name] = cc;
      }
    }
  }

  // Clean empty columns object
  if (Object.keys(config.columns!).length === 0) {
    delete config.columns;
  }

  await configStore.setTableConfig(table, config);

  return {
    status: 302,
    headers: { location: `${ctx.prefix}/${table}?flash=success&msg=${encodeURIComponent("config saved")}` },
    redirect: `${ctx.prefix}/${table}?flash=success&msg=${encodeURIComponent("config saved")}`,
  };
}
