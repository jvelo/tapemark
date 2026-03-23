import { TapemarkLayout } from "../components/TapemarkLayout";
import { renderPage } from "../render";
import { SchemaIntrospector } from "../schema";
import { NotFoundError } from "../errors";
import type { CellValue, TapemarkContext, TapemarkRequest, TapemarkResponse } from "../types";

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

  const rows = await ctx.db
    .prepare(`SELECT * FROM "${table}" LIMIT 1 OFFSET ?`)
    .bind(index)
    .all<Record<string, CellValue>>();

  if (rows.length === 0) {
    throw new NotFoundError("Row not found");
  }

  const row = rows[0];

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
      siteUrl={ctx.siteUrl}
      siteName={ctx.siteName}
      crumbs={crumbs}
      scripts={ctx.scripts}
    >
      <h2 class="tm-section-title">view row</h2>
      <div class="tm-form">
        {tableInfo.columns.map((col) => {
          const val = row[col.name];
          const strVal = val === null || val === undefined ? "" : String(val);
          return (
            <div class="tm-field">
              <label>{col.name}</label>
              <input
                type="text"
                value={strVal}
                disabled
              />
              <span class="tm-field-hint">
                {col.rawType || "TEXT"}
              </span>
            </div>
          );
        })}
      </div>
    </TapemarkLayout>,
  );

  return {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    html,
  };
}
