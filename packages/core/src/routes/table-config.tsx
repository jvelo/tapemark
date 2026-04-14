import { TapemarkLayout } from "../components/TapemarkLayout";
import { ConfigForm } from "../components/ConfigForm";
import { Flash } from "../components/Flash";
import { renderPage } from "../render";
import { SchemaIntrospector } from "../schema";
import { ConfigStore } from "../config";
import { inferEditor, resolveEditor } from "../editor";
import { assertWritable } from "./guard";
import { redirect } from "./response";
import type {
  ColumnConfig,
  OptionSchema,
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

  const inferredOptionsByColumn = await computeInferredOptions(
    ctx,
    tableInfo,
    config,
  );

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
        columns={tableInfo.columns}
        foreignKeys={tableInfo.foreignKeys}
        inferredOptionsByColumn={inferredOptionsByColumn}
        config={config}
        displayTypes={ctx.displayTypes}
        editorTypes={ctx.editorTypes}
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
  const priorConfig = await configStore.getTableConfig(table);

  const config: TableConfig = { columns: {} };

  // Build a single-column FK lookup so we can infer editors correctly
  const fkByColumn = new Map<string, typeof tableInfo.foreignKeys[number]>();
  for (const fk of tableInfo.foreignKeys) {
    if (fk.columns.length === 1) {
      fkByColumn.set(fk.columns[0], fk);
    }
  }

  // Compute the same inferred options the GET route shows, so we can strip
  // submitted values that match — i.e. don't pin defaults that the user
  // didn't actively change.
  const inferredByCol = await computeInferredOptions(ctx, tableInfo, priorConfig);

  if (req.body) {
    for (const col of tableInfo.columns) {
      const display: string =
        (req.body[`${col.name}__display`] as string) || "text";
      const editor: string =
        (req.body[`${col.name}__editor`] as string) || "";
      const label: string =
        (req.body[`${col.name}__label`] as string) || "";
      const hidden = !!req.body[`${col.name}__hidden`];

      const displayOptions = parseSchemaOptions(
        req.body,
        col.name,
        "display",
        ctx.displayTypes.get(display)?.schema,
      );
      let editorOptions = editor
        ? parseSchemaOptions(
            req.body,
            col.name,
            "editor",
            ctx.editorTypes.get(editor)?.schema,
          )
        : {};

      const cc: ColumnConfig = {};
      if (display !== "text") cc.display = display;
      if (label) cc.label = label;
      if (hidden) cc.hidden = true;
      if (Object.keys(displayOptions).length > 0) cc.displayOptions = displayOptions;

      // Only store `editor` when it differs from what would be inferred.
      // This keeps the config lean and lets future display/FK changes re-infer.
      const inferredEditor = inferEditor(col, cc, ctx.displayTypes, fkByColumn.get(col.name));
      if (editor && editor !== inferredEditor) cc.editor = editor;

      // If the selected editor matches the inferred one, strip option values
      // that match the inferred defaults — so opening+saving the page
      // doesn't pin inferred values into the stored config.
      if (editor === inferredEditor) {
        const inferred = inferredByCol[col.name] ?? {};
        editorOptions = stripMatching(editorOptions, inferred);
      }
      if (Object.keys(editorOptions).length > 0) cc.editorOptions = editorOptions;

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

/**
 * Parse options for one kind (display/editor) from the form body.
 * Field names are `{col}__{kind}_opt__{optionName}`. Only stores values
 * that differ from the schema default.
 */
function parseSchemaOptions(
  body: Record<string, string | string[]>,
  colName: string,
  kind: "display" | "editor",
  schema: OptionSchema | undefined,
): Record<string, unknown> {
  const prefix = `${colName}__${kind}_opt__`;
  const parsed: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(body)) {
    if (!key.startsWith(prefix)) continue;
    const optName = key.slice(prefix.length);
    const strVal = String(val);
    const propDef = schema?.properties?.[optName];
    if (propDef?.type === "number" && strVal !== "") {
      const n = Number(strVal);
      if (!Number.isNaN(n)) parsed[optName] = n;
    } else if (propDef?.type === "boolean") {
      parsed[optName] = strVal === "1" || strVal === "true";
    } else if (strVal !== "") {
      parsed[optName] = strVal;
    }
  }

  // Unchecked boolean checkboxes are absent from the body → set to false
  if (schema?.properties) {
    for (const [optName, propDef] of Object.entries(schema.properties)) {
      if (propDef.type === "boolean" && !(`${prefix}${optName}` in body)) {
        parsed[optName] = false;
      }
    }
  }

  // Drop values that match the default
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    const defaultVal = schema?.properties?.[k]?.default;
    if (v !== defaultVal) cleaned[k] = v;
  }
  return cleaned;
}

/**
 * For each column, compute the inferred editor options the user sees in
 * the config UI: sync inference from resolveEditor plus any async options
 * contributed by the editor's `inferOptions` hook.
 */
async function computeInferredOptions(
  ctx: TapemarkContext,
  tableInfo: Awaited<ReturnType<SchemaIntrospector["getTable"]>>,
  config: TableConfig,
): Promise<Record<string, Record<string, unknown>>> {
  const fkByCol = new Map<string, typeof tableInfo.foreignKeys[number]>();
  for (const fk of tableInfo.foreignKeys) {
    if (fk.columns.length === 1) fkByCol.set(fk.columns[0], fk);
  }
  const out: Record<string, Record<string, unknown>> = {};
  for (const col of tableInfo.columns) {
    const cc = config.columns?.[col.name];
    const fk = fkByCol.get(col.name);
    const inferred = resolveEditor(
      col,
      cc ? { ...cc, editor: undefined } : undefined,
      ctx.displayTypes,
      fk,
    );
    const editor = ctx.editorTypes.get(inferred.editor);
    const asyncOptions = editor?.inferOptions
      ? await editor.inferOptions({ column: col, fk, db: ctx.db })
      : {};
    out[col.name] = { ...inferred.options, ...asyncOptions };
  }
  return out;
}

/** Return a copy of `opts` with keys removed whose value matches `reference`. */
function stripMatching(
  opts: Record<string, unknown>,
  reference: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(opts)) {
    if (reference[k] !== v) out[k] = v;
  }
  return out;
}
