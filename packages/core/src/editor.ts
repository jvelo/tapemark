import { escapeHtml } from "./html";
import { pickLabelColumn } from "./routes/lookup";
import { SchemaIntrospector } from "./schema";
import type {
  Column,
  ColumnConfig,
  DisplayType,
  EditorType,
  ForeignKey,
} from "./types";

function strVal(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function fieldId(name: string): string {
  return `f-${name}`;
}

function req(flags: { required?: boolean } | undefined): string {
  return flags?.required ? " required" : "";
}

const textEditor: EditorType = {
  name: "text",
  description: "Single-line text input",
  schema: {
    type: "object",
    properties: {
      suggest: {
        type: "boolean",
        default: false,
        description: "Suggest existing values when typing",
      },
    },
  },
  render(column, value, options, flags) {
    const v = strVal(value);
    const suggest = options.suggest === true;
    const listAttr = suggest ? ` list="tm-suggest-${escapeHtml(column.name)}"` : "";
    return (
      `<input id="${fieldId(escapeHtml(column.name))}" ` +
      `name="${escapeHtml(column.name)}" type="text" ` +
      `value="${escapeHtml(v)}"${listAttr}${req(flags)} />`
    );
  },
};

const textareaEditor: EditorType = {
  name: "textarea",
  description: "Multi-line text area",
  schema: {
    type: "object",
    properties: {
      rows: {
        type: "number",
        default: 4,
        description: "Visible rows",
      },
    },
  },
  render(column, value, options, flags) {
    const v = strVal(value);
    const rows = (options.rows as number) ?? 4;
    return (
      `<textarea id="${fieldId(escapeHtml(column.name))}" ` +
      `name="${escapeHtml(column.name)}" rows="${rows}"${req(flags)}>${escapeHtml(v)}</textarea>`
    );
  },
};

const numberEditor: EditorType = {
  name: "number",
  description: "Numeric input",
  schema: {
    type: "object",
    properties: {
      step: {
        type: "string",
        default: "any",
        description: "Step increment (or 'any')",
      },
    },
  },
  render(column, value, options, flags) {
    const v = strVal(value);
    const step = (options.step as string) ?? "any";
    return (
      `<input id="${fieldId(escapeHtml(column.name))}" ` +
      `name="${escapeHtml(column.name)}" type="number" ` +
      `step="${escapeHtml(step)}" value="${escapeHtml(v)}"${req(flags)} />`
    );
  },
};

const colorEditor: EditorType = {
  name: "color",
  description: "Native color picker",
  schema: { type: "object", properties: {} },
  render(column, value, _options, flags) {
    const v = strVal(value) || "#000000";
    return (
      `<input id="${fieldId(escapeHtml(column.name))}" ` +
      `name="${escapeHtml(column.name)}" type="color" value="${escapeHtml(v)}"${req(flags)} />`
    );
  },
};

const datetimeEditor: EditorType = {
  name: "datetime",
  description: "Local datetime picker",
  schema: { type: "object", properties: {} },
  render(column, value, _options, flags) {
    const v = strVal(value);
    return (
      `<input id="${fieldId(escapeHtml(column.name))}" ` +
      `name="${escapeHtml(column.name)}" type="datetime-local" value="${escapeHtml(v)}"${req(flags)} />`
    );
  },
};

const urlEditor: EditorType = {
  name: "url",
  description: "URL input",
  schema: { type: "object", properties: {} },
  render(column, value, _options, flags) {
    const v = strVal(value);
    return (
      `<input id="${fieldId(escapeHtml(column.name))}" ` +
      `name="${escapeHtml(column.name)}" type="url" value="${escapeHtml(v)}"${req(flags)} />`
    );
  },
};

const enumEditor: EditorType = {
  name: "enum",
  description: "Select from a fixed set of values",
  schema: {
    type: "object",
    properties: {
      values: {
        type: "string",
        default: "",
        description: 'Comma-separated values, or JSON map {"value":"label"}',
      },
    },
  },
  render(column, value, options, flags) {
    const v = strVal(value);
    const raw = String(options.values ?? "").trim();
    const entries: Array<[string, string]> = [];
    if (raw.startsWith("{")) {
      try {
        const map = JSON.parse(raw) as Record<string, string>;
        for (const [key, label] of Object.entries(map)) {
          entries.push([key, label]);
        }
      } catch {
        /* ignore */
      }
    } else if (raw) {
      for (const val of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
        entries.push([val, val]);
      }
    }
    const options_ = entries
      .map(
        ([val, label]) =>
          `<option value="${escapeHtml(val)}"${val === v ? " selected" : ""}>${escapeHtml(label)}</option>`,
      )
      .join("");
    const empty = column.nullable
      ? `<option value=""${v === "" ? " selected" : ""}></option>`
      : "";
    return (
      `<select id="${fieldId(escapeHtml(column.name))}" ` +
      `name="${escapeHtml(column.name)}"${req(flags)}>${empty}${options_}</select>`
    );
  },
};

const checkboxEditor: EditorType = {
  name: "checkbox",
  description: "Checkbox (stores 1 or 0)",
  schema: { type: "object", properties: {} },
  render(column, value) {
    const v = strVal(value);
    const checked = v === "1" || v === "true" ? " checked" : "";
    // Hidden input ensures the field is submitted as "0" when unchecked.
    return (
      `<input type="hidden" name="${escapeHtml(column.name)}" value="0" />` +
      `<input id="${fieldId(escapeHtml(column.name))}" ` +
      `name="${escapeHtml(column.name)}" type="checkbox" value="1"${checked} />`
    );
  },
};

const referenceEditor: EditorType = {
  name: "reference",
  description: "Foreign-key picker",
  schema: {
    type: "object",
    properties: {
      table: {
        type: "string",
        description: "Referenced table name",
      },
      labelColumn: {
        type: "string",
        description: "Column to use as display label in the referenced table",
      },
    },
  },
  async inferOptions({ fk, db }) {
    if (!fk) return {};
    try {
      const refTable = await new SchemaIntrospector(db).getTable(fk.referencedTable);
      const label = pickLabelColumn(refTable);
      return label ? { labelColumn: label } : {};
    } catch {
      return {};
    }
  },
  render(column, value, options, flags) {
    const v = strVal(value);
    const table = options.table as string | undefined;
    if (!table) {
      return (
        `<input id="${fieldId(escapeHtml(column.name))}" ` +
        `name="${escapeHtml(column.name)}" type="text" value="${escapeHtml(v)}"${req(flags)} />`
      );
    }
    const labelColumn = options.labelColumn as string | undefined;
    const labelAttr = labelColumn
      ? ` data-label-column="${escapeHtml(labelColumn)}"`
      : "";
    return (
      `<tm-reference-input data-table="${escapeHtml(table)}" ` +
      `data-column="${escapeHtml(column.name)}" ` +
      `data-value="${escapeHtml(v)}"${labelAttr}>` +
      `<input id="${fieldId(escapeHtml(column.name))}" ` +
      `name="${escapeHtml(column.name)}" type="hidden" value="${escapeHtml(v)}" />` +
      `</tm-reference-input>`
    );
  },
};

export const builtinEditorTypes: Record<string, EditorType> = {
  text: textEditor,
  textarea: textareaEditor,
  number: numberEditor,
  color: colorEditor,
  datetime: datetimeEditor,
  url: urlEditor,
  enum: enumEditor,
  checkbox: checkboxEditor,
  reference: referenceEditor,
};

export function createEditorTypeRegistry(
  custom?: Record<string, EditorType>,
): Map<string, EditorType> {
  const registry = new Map<string, EditorType>();
  for (const [name, type] of Object.entries(builtinEditorTypes)) {
    registry.set(name, type);
  }
  if (custom) {
    for (const [name, type] of Object.entries(custom)) {
      registry.set(name, type);
    }
  }
  return registry;
}

/**
 * Resolve the effective editor for a column. Precedence:
 *   1. Explicit `cc.editor`
 *   2. Display type's `defaultEditor` hint
 *   3. Single-column FK → `reference` (with table set from FK)
 *   4. Affinity fallback: INTEGER/REAL/NUMERIC → `number`, else `text`
 */
export function resolveEditor(
  col: Column,
  cc: ColumnConfig | undefined,
  displayTypes: Map<string, DisplayType> | undefined,
  fk: ForeignKey | undefined,
): { editor: string; options: Record<string, unknown> } {
  if (cc?.editor) {
    return { editor: cc.editor.type, options: cc.editor.options ?? {} };
  }
  if (cc?.display) {
    const dt = displayTypes?.get(cc.display.type);
    if (dt?.defaultEditor) {
      return { editor: dt.defaultEditor, options: {} };
    }
  }
  if (fk) {
    return { editor: "reference", options: { table: fk.referencedTable } };
  }
  if (
    col.affinity === "integer" ||
    col.affinity === "real" ||
    col.affinity === "numeric"
  ) {
    return { editor: "number", options: {} };
  }
  return { editor: "text", options: {} };
}

/** Compute the editor that would be inferred if `cc.editor` was unset. */
export function inferEditor(
  col: Column,
  cc: ColumnConfig | undefined,
  displayTypes: Map<string, DisplayType> | undefined,
  fk: ForeignKey | undefined,
): string {
  const ccWithoutEditor: ColumnConfig | undefined = cc
    ? { ...cc, editor: undefined }
    : undefined;
  return resolveEditor(col, ccWithoutEditor, displayTypes, fk).editor;
}
