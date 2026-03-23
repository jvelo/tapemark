import { TapemarkLayout } from "../components/TapemarkLayout";
import { renderPage } from "../render";
import { SchemaIntrospector } from "../schema";
import type { TapemarkContext, TapemarkRequest, TapemarkResponse } from "../types";

export async function tablesRoute(
  _req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const introspector = new SchemaIntrospector(ctx.db);
  const tables = await introspector.getTables();

  // Filter hidden tables
  const visibleTables = tables.filter(
    (t) => !ctx.tableOptions.get(t.name)?.hidden,
  );

  const html = renderPage(
    <TapemarkLayout title="tables" prefix={ctx.prefix} scripts={ctx.scripts}>
      <h2 class="tm-section-title">tables</h2>
      <table>
        <thead>
          <tr>
            <th>name</th>
            <th>rows</th>
          </tr>
        </thead>
        <tbody>
          {visibleTables.map((t) => (
            <tr>
              <td>
                <a href={`${ctx.prefix}/${t.name}`}>{t.name}</a>
              </td>
              <td class="tm-muted">{t.rowCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TapemarkLayout>,
  );

  return {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    html,
  };
}
