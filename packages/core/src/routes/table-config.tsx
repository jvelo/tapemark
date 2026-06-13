/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { TapemarkLayout } from "../components/TapemarkLayout";
import { ConfigForm } from "../components/ConfigForm";
import { Flash } from "../components/Flash";
import { renderPage } from "../render";
import { SchemaIntrospector } from "../schema";
import { ConfigStore, orderColumns } from "../config";
import { assertWritable } from "./guard";
import { redirect } from "./response";
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
      symbol={ctx.symbol}
      siteUrl={ctx.siteUrl} siteName={ctx.siteName}
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
        columns={orderColumns(tableInfo.columns, config)}
        primaryKey={tableInfo.primaryKey}
        hasRowid={tableInfo.hasRowid}
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
  assertWritable(table, ctx);

  const introspector = new SchemaIntrospector(ctx.db);
  const tableInfo = await introspector.getTable(table);
  const configStore = new ConfigStore(ctx.db);
  const existing = await configStore.getTableConfig(table);

  // Preserve fields not represented in the form (e.g. `order`).
  const config: TableConfig = { columns: {} };
  if (existing.order) config.order = existing.order;

  if (req.body) {
    for (const col of tableInfo.columns) {
      const display: string =
        (req.body[`${col.name}__display`] as string) || "text";
      const label: string =
        (req.body[`${col.name}__label`] as string) || "";
      const hidden = !!req.body[`${col.name}__hidden`];
      const showOnCreate = !!req.body[`${col.name}__showOnCreate`];

      // Parse display type options (fields named colName__opt__key)
      const dtSchema = ctx.displayTypes.get(display)?.schema;
      const options: Record<string, unknown> = {};
      const optPrefix = `${col.name}__opt__`;
      for (const [key, val] of Object.entries(req.body)) {
        if (key.startsWith(optPrefix)) {
          const optName = key.slice(optPrefix.length);
          const strVal = String(val);
          const propDef = dtSchema?.properties?.[optName];
          if (propDef?.type === "number" && strVal !== "") {
            const n = Number(strVal);
            if (!Number.isNaN(n)) options[optName] = n;
          } else if (propDef?.type === "boolean") {
            options[optName] = strVal === "1" || strVal === "true";
          } else if (strVal !== "") {
            options[optName] = strVal;
          }
        }
      }
      // For boolean options not present in the body (unchecked checkboxes)
      if (dtSchema?.properties) {
        for (const [optName, propDef] of Object.entries(dtSchema.properties)) {
          if (propDef.type === "boolean" && !((`${col.name}__opt__${optName}`) in req.body)) {
            options[optName] = false;
          }
        }
      }

      const cc: ColumnConfig = {};
      if (display !== "text") cc.display = display;
      if (label) cc.label = label;
      if (hidden) cc.hidden = true;
      if (showOnCreate) cc.showOnCreate = true;
      // Only store options that differ from defaults
      const cleanedOptions: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(options)) {
        const defaultVal = dtSchema?.properties?.[k]?.default;
        if (v !== defaultVal) cleanedOptions[k] = v;
      }
      if (Object.keys(cleanedOptions).length > 0) cc.options = cleanedOptions;

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

  return redirect(`${ctx.prefix}/${table}?flash=success&msg=${encodeURIComponent("config saved")}`);
}
