import { TapemarkLayout } from "../components/TapemarkLayout";
import { RowForm } from "../components/RowForm";
import { Flash } from "../components/Flash";
import { renderPage } from "../render";
import { SchemaIntrospector } from "../schema";
import { TableRepository, decodePk, encodePk } from "../repository";
import type { TapemarkContext, TapemarkRequest, TapemarkResponse } from "../types";

export async function rowDetailRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;
  const pkParam = req.params.pk;

  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(table);
  const repo = new TableRepository(ctx.db);
  const pkValues = decodePk(tableInfo.primaryKey, pkParam);
  const row = await repo.getRow(table, pkValues);

  const isReadonly = ctx.readonly || ctx.tableOptions.get(table)?.readonly;

  const crumbs = [
    { label: "tables", href: ctx.prefix || "/" },
    { label: table, href: `${ctx.prefix}/${table}` },
    { label: pkParam },
  ];

  const html = renderPage(
    <TapemarkLayout
      title={`${table} / ${pkParam}`}
      prefix={ctx.prefix}
      name={ctx.name}
      siteUrl={ctx.siteUrl} siteName={ctx.siteName}
      crumbs={crumbs}
      scripts={ctx.scripts}
    >
      <Flash type={req.query.flash} message={req.query.msg} />
      <h2 class="tm-section-title">
        {isReadonly ? "view row" : "edit row"}
      </h2>
      <RowForm
        columns={tableInfo.columns}
        primaryKey={tableInfo.primaryKey}
        values={row}
        action={`${ctx.prefix}/${table}/${pkParam}`}
        submitLabel="save"
      />
      {!isReadonly && (
        <form
          method="post"
          action={`${ctx.prefix}/${table}/${pkParam}/delete`}
          class="tm-delete-section"
        >
          <tm-confirm-button data-message={`delete row ${pkParam}?`}>
            <button type="submit" class="tm-btn tm-btn-danger">
              delete row
            </button>
          </tm-confirm-button>
        </form>
      )}
    </TapemarkLayout>,
  );

  return {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    html,
  };
}

export async function rowUpdateRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;
  const pkParam = req.params.pk;

  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(table);
  const repo = new TableRepository(ctx.db);
  const pkValues = decodePk(tableInfo.primaryKey, pkParam);

  const data: Record<string, string> = {};
  if (req.body) {
    for (const col of tableInfo.columns) {
      if (col.name in req.body) {
        data[col.name] = String(req.body[col.name]);
      }
    }
  }

  await repo.updateRow(table, pkValues, data);

  const newPk = encodePk(tableInfo.primaryKey, { ...pkValues, ...data });
  return {
    status: 302,
    headers: { location: `${ctx.prefix}/${table}/${newPk}?flash=success&msg=${encodeURIComponent("row updated")}` },
    redirect: `${ctx.prefix}/${table}/${newPk}?flash=success&msg=${encodeURIComponent("row updated")}`,
  };
}

export async function rowDeleteRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;
  const pkParam = req.params.pk;

  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(table);
  const repo = new TableRepository(ctx.db);
  const pkValues = decodePk(tableInfo.primaryKey, pkParam);

  await repo.deleteRow(table, pkValues);

  return {
    status: 302,
    headers: { location: `${ctx.prefix}/${table}?flash=success&msg=${encodeURIComponent("row deleted")}` },
    redirect: `${ctx.prefix}/${table}?flash=success&msg=${encodeURIComponent("row deleted")}`,
  };
}
