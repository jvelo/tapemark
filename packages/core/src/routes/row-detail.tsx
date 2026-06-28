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
import { TableRepository, decodePk, encodePk } from "../repository";
import { ConfigStore, orderColumns } from "../config";
import { fireAfterDelete, fireAfterUpdate, flashForHookResult, isActionVisibleFor } from "../hooks";
import { groupActions, menuSlug } from "../actions";
import { assertWritable } from "./guard";
import { redirect } from "./response";
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
  const configStore = new ConfigStore(ctx.db);
  const pkValues = decodePk(tableInfo.primaryKey, pkParam);
  const encodedPk = encodePk(tableInfo.primaryKey, pkValues);
  // Human label for display: the decoded PK value(s); `pkParam` is the raw,
  // still-encoded URL segment.
  const pkLabel = Object.values(pkValues).join(", ");
  const row = await repo.getRow(table, pkValues);
  const tableConfig = await configStore.getTableConfig(table);

  const isView = tableInfo.kind === "view";
  const tableOpts = ctx.tableOptions.get(table);
  const isReadonly = isView || ctx.readonly || tableOpts?.readonly;
  const visibleActions = Object.entries(tableOpts?.actions ?? {}).filter(
    ([, action]) =>
      action.display?.detail !== false && isActionVisibleFor(action, row),
  );

  const crumbs = [
    { label: "tables", href: ctx.prefix || "/" },
    { label: table, href: `${ctx.prefix}/${table}` },
    { label: pkLabel },
  ];

  const html = renderPage(
    <TapemarkLayout
      title={`${table} / ${pkLabel}`}
      prefix={ctx.prefix}
      name={ctx.name}
      symbol={ctx.symbol}
      siteUrl={ctx.siteUrl} siteName={ctx.siteName}
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
        action={`${ctx.prefix}/${table}/${encodedPk}`}
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
          <div class="tm-row-actions-form">
            <button type="submit" form="tm-edit-form" class="tm-btn tm-btn-primary">
              save
            </button>
          </div>
          <div class="tm-row-actions-row">
            {groupActions(visibleActions).map((item, index) => {
              if (item.kind === "single") {
                return (
                  <form
                    method="post"
                    action={`${ctx.prefix}/${table}/${encodedPk}/_action/${item.name}`}
                    class="tm-action-inline"
                  >
                    <button type="submit" class="tm-btn">
                      {item.action.label}
                    </button>
                  </form>
                );
              }
              const menuId = `tm-menu-${index}-${menuSlug(item.label)}`;
              return (
                <>
                  <button
                    type="button"
                    class="tm-btn tm-menu-trigger"
                    popovertarget={menuId}
                  >
                    {item.label} ▾
                  </button>
                  <div id={menuId} popover="auto" class="tm-menu">
                    {item.entries.map(([name, action]) => (
                      <form
                        method="post"
                        action={`${ctx.prefix}/${table}/${encodedPk}/_action/${name}`}
                        class="tm-action-inline"
                      >
                        <button type="submit" class="tm-btn tm-menu-item">
                          {action.label}
                        </button>
                      </form>
                    ))}
                  </div>
                </>
              );
            })}
            <form
              method="post"
              action={`${ctx.prefix}/${table}/${encodedPk}/delete`}
              class="tm-delete-inline"
            >
              <tm-confirm-button data-message={`delete row ${pkLabel}?`}>
                <button type="submit" class="tm-btn tm-btn-danger">
                  delete row
                </button>
              </tm-confirm-button>
            </form>
          </div>
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

export async function rowUpdateRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;
  const pkParam = req.params.pk;
  assertWritable(table, ctx);

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

  const patch = await repo.updateRow(table, pkValues, data);

  const hookError = await fireAfterUpdate(table, pkValues, patch, ctx, req);
  const { flash, message } = flashForHookResult("row updated", hookError);

  const newPk = encodePk(tableInfo.primaryKey, { ...pkValues, ...data });
  return redirect(
    `${ctx.prefix}/${table}/${newPk}?flash=${flash}&msg=${encodeURIComponent(message)}`,
  );
}

export async function rowDeleteRoute(
  req: TapemarkRequest,
  ctx: TapemarkContext,
): Promise<TapemarkResponse> {
  const table = req.params.table;
  const pkParam = req.params.pk;
  assertWritable(table, ctx);

  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(table);
  const repo = new TableRepository(ctx.db);
  const pkValues = decodePk(tableInfo.primaryKey, pkParam);

  await repo.deleteRow(table, pkValues);

  const hookError = await fireAfterDelete(table, pkValues, ctx, req);
  const { flash, message } = flashForHookResult("row deleted", hookError);

  return redirect(
    `${ctx.prefix}/${table}?flash=${flash}&msg=${encodeURIComponent(message)}`,
  );
}
