import { TapemarkLayout } from "../components/TapemarkLayout";
import { DataTable } from "../components/DataTable";
import { Pagination } from "../components/Pagination";
import { Flash } from "../components/Flash";
import { renderPage } from "../render";
import { SchemaIntrospector } from "../schema";
import { TableRepository, encodePk } from "../repository";
import { ConfigStore } from "../config";
import type { TapemarkContext, TapemarkRequest, TapemarkResponse } from "../types";

export async function rowsRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;
  const page = parseInt(req.query.page || "1", 10) || 1;
  const pageSize = 50;

  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(table);
  const repo = new TableRepository(ctx.db);
  const result = await repo.getRows(table, page, pageSize);
  const configStore = new ConfigStore(ctx.db);
  const tableConfig = await configStore.getTableConfig(table);

  const hasPk = tableInfo.primaryKey.length > 0;
  const isReadonly = ctx.readonly || ctx.tableOptions.get(table)?.readonly;

  const crumbs = [
    { label: "tables", href: ctx.prefix || "/" },
    { label: table },
  ];

  const html = renderPage(
    <TapemarkLayout
      title={table}
      prefix={ctx.prefix}
      name={ctx.name}
      siteUrl={ctx.siteUrl} siteName={ctx.siteName}
      crumbs={crumbs}
      scripts={ctx.scripts}
    >
      <Flash type={req.query.flash} message={req.query.msg} />
      <div class="tm-toolbar">
        <h2 class="tm-section-title">
          {table} <span class="tm-muted">({result.total})</span>
        </h2>
        <div class="tm-actions">
          <a href={`${ctx.prefix}/${table}/_config`} class="tm-btn">
            config
          </a>
          {hasPk && !isReadonly && (
            <a
              href={`${ctx.prefix}/${table}/new`}
              class="tm-btn tm-btn-primary"
            >
              + new row
            </a>
          )}
        </div>
      </div>
      <DataTable
        columns={tableInfo.columns}
        primaryKey={tableInfo.primaryKey}
        rows={result.rows}
        linkBase={`${ctx.prefix}/${table}`}
        encodePk={(row) => encodePk(tableInfo.primaryKey, row)}
        tableConfig={tableConfig}
        displayTypes={ctx.displayTypes}
        page={page}
      />
      <div class="tm-table-footer">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={result.total}
          baseUrl={`${ctx.prefix}/${table}`}
        />
        {hasPk && !isReadonly && (
          <tm-confirm-button data-message="delete selected rows?">
            <button
              type="submit"
              form="tm-bulk-form"
              class="tm-btn tm-btn-danger"
              id="tm-bulk-delete-btn"
              disabled
            >
              delete selected
            </button>
          </tm-confirm-button>
        )}
      </div>
    </TapemarkLayout>,
  );

  return {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    html,
  };
}
