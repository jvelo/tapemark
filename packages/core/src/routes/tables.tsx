import { TapemarkLayout } from "../components/TapemarkLayout";
import { renderPage } from "../render";
import { SchemaIntrospector } from "../schema";
import type { Table, TapemarkContext, TapemarkRequest, TapemarkResponse } from "../types";

function TableList({ items, prefix }: { items: Table[]; prefix: string }) {
  if (items.length === 0) return null;
  return (
    <table class="tm-table-compact">
      <thead>
        <tr>
          <th>name</th>
          <th>rows</th>
        </tr>
      </thead>
      <tbody>
        {items.map((t) => (
          <tr>
            <td>
              <a href={`${prefix}/${t.name}`}>{t.name}</a>
            </td>
            <td class="tm-muted">{t.rowCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export async function tablesRoute(
  _req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const introspector = new SchemaIntrospector(ctx.db);
  const all = await introspector.getTables();

  const visible = all.filter(
    (t) => !ctx.tableOptions.get(t.name)?.hidden,
  );

  const tables = visible.filter((t) => t.kind === "table");
  const views = visible.filter((t) => t.kind === "view");

  const html = renderPage(
    <TapemarkLayout title="tables" prefix={ctx.prefix} name={ctx.name} siteUrl={ctx.siteUrl} siteName={ctx.siteName} scripts={ctx.scripts}>
      <h2 class="tm-section-title">tables</h2>
      <TableList items={tables} prefix={ctx.prefix} />
      {views.length > 0 && (
        <>
          <h2 class="tm-section-title tm-section-views">views</h2>
          <TableList items={views} prefix={ctx.prefix} />
        </>
      )}
    </TapemarkLayout>,
  );

  return {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    html,
  };
}
