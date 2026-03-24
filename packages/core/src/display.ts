import type { DisplayType } from "./types";

// ---------------------------------------------------------------------------
// Built-in display types
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

const textDisplay: DisplayType = {
  name: "text",
  description: "Truncated text (default)",
  schema: {
    type: "object",
    properties: {
      maxLength: {
        type: "number",
        default: 80,
        description: "Maximum display length before truncation",
      },
    },
  },
  render(value, options) {
    const max = (options.maxLength as number) ?? 80;
    const str = String(value ?? "");
    return escapeHtml(truncate(str, max));
  },
};

const imageDisplay: DisplayType = {
  name: "image",
  description: "Inline thumbnail with hover preview",
  schema: {
    type: "object",
    properties: {
      height: {
        type: "number",
        default: 48,
        description: "Thumbnail height in pixels",
      },
      maxPreview: {
        type: "number",
        default: 240,
        description: "Max preview height on hover",
      },
    },
  },
  render(value, options) {
    const url = String(value ?? "");
    if (!url) return "";
    const height = (options.height as number) ?? 48;
    const maxPreview = (options.maxPreview as number) ?? 240;
    return `<tm-image-cell data-src="${escapeHtml(url)}" data-height="${height}" data-preview="${maxPreview}"></tm-image-cell>`;
  },
};

const linkDisplay: DisplayType = {
  name: "link",
  description: "Clickable URL",
  schema: {
    type: "object",
    properties: {
      truncate: {
        type: "number",
        default: 60,
        description: "Truncation length for display text",
      },
      external: {
        type: "boolean",
        default: true,
        description: "Open in new tab",
      },
    },
  },
  render(value, options) {
    const url = String(value ?? "");
    if (!url) return "";
    const max = (options.truncate as number) ?? 60;
    const external = (options.external as boolean) ?? true;
    const target = external ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${escapeHtml(url)}"${target} class="tm-cell-link">${escapeHtml(truncate(url, max))}</a>`;
  },
};

const jsonDisplay: DisplayType = {
  name: "json",
  description: "Syntax-dimmed JSON preview",
  schema: {
    type: "object",
    properties: {
      maxDepth: {
        type: "number",
        default: 3,
        description: "Max nesting depth to display",
      },
      collapsed: {
        type: "boolean",
        default: false,
        description: "Start collapsed",
      },
    },
  },
  render(value) {
    const str = String(value ?? "");
    try {
      const parsed = JSON.parse(str);
      const formatted = JSON.stringify(parsed, null, 2);
      return `<code class="tm-cell-json">${escapeHtml(truncate(formatted, 200))}</code>`;
    } catch {
      return `<code class="tm-cell-json">${escapeHtml(truncate(str, 200))}</code>`;
    }
  },
};

const datetimeDisplay: DisplayType = {
  name: "datetime",
  description: "Formatted timestamp",
  schema: {
    type: "object",
    properties: {
      format: {
        type: "string",
        default: "YYYY-MM-DD HH:mm",
        description: "Date format string",
      },
      relative: {
        type: "boolean",
        default: false,
        description: "Show relative time",
      },
    },
  },
  render(value) {
    const str = String(value ?? "");
    return `<time class="tm-cell-datetime">${escapeHtml(str)}</time>`;
  },
};

const colorDisplay: DisplayType = {
  name: "color",
  description: "Color swatch with value",
  schema: {
    type: "object",
    properties: {
      swatchSize: {
        type: "number",
        default: 12,
        description: "Swatch size in pixels",
      },
    },
  },
  render(value, options) {
    const color = String(value ?? "");
    if (!color) return "";
    const size = (options.swatchSize as number) ?? 12;
    return `<span class="tm-cell-color"><span class="tm-swatch" style="--tm-swatch-size:${size}px;--tm-swatch-color:${escapeHtml(color)}"></span>${escapeHtml(color)}</span>`;
  },
};

const enumDisplay: DisplayType = {
  name: "enum",
  description: "Badge / label display",
  schema: {
    type: "object",
    properties: {
      colors: {
        type: "string",
        default: "{}",
        description: "JSON map of value → color",
      },
    },
  },
  render(value, options) {
    const str = String(value ?? "");
    let colors: Record<string, string> = {};
    if (typeof options.colors === "string") {
      try {
        colors = JSON.parse(options.colors);
      } catch { /* ignore */ }
    } else if (typeof options.colors === "object" && options.colors) {
      colors = options.colors as Record<string, string>;
    }
    const bg = colors[str] ?? "#555";
    return `<span class="tm-cell-enum" style="--tm-enum-color:${escapeHtml(bg)}">${escapeHtml(str)}</span>`;
  },
};

const referenceDisplay: DisplayType = {
  name: "reference",
  description: "Foreign key reference with lookup",
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
  render(value, options) {
    if (value === null || value === undefined) return "";
    const table = options.table as string | undefined;
    const labels = options._labels as Record<string, string> | undefined;
    const str = String(value);
    const label = labels?.[str] ?? str;
    if (!table) return escapeHtml(label);
    return `<a href="${escapeHtml(table)}/${escapeHtml(str)}" class="tm-cell-ref">${escapeHtml(label)}</a>`;
  },
  renderInput(column, value, options) {
    const table = options.table as string | undefined;
    const labelColumn = options.labelColumn as string | undefined;
    const strVal = value === null || value === undefined ? "" : String(value);
    if (!table) {
      return `<input id="f-${escapeHtml(column.name)}" name="${escapeHtml(column.name)}" type="text" value="${escapeHtml(strVal)}" />`;
    }
    const labelAttr = labelColumn ? ` data-label-column="${escapeHtml(labelColumn)}"` : "";
    return `<tm-reference-input data-table="${escapeHtml(table)}" data-column="${escapeHtml(column.name)}" data-value="${escapeHtml(strVal)}"${labelAttr}>`
      + `<input id="f-${escapeHtml(column.name)}" name="${escapeHtml(column.name)}" type="hidden" value="${escapeHtml(strVal)}" />`
      + `</tm-reference-input>`;
  },
  editorComponent: "tm-reference-input",
};

const markdownDisplay: DisplayType = {
  name: "markdown",
  description: "Rendered markdown preview",
  schema: {
    type: "object",
    properties: {
      maxLength: {
        type: "number",
        default: 200,
        description: "Preview truncation length",
      },
    },
  },
  render(value, options) {
    const max = (options.maxLength as number) ?? 200;
    const str = String(value ?? "");
    return `<span class="tm-cell-markdown">${escapeHtml(truncate(str, max))}</span>`;
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const builtinDisplayTypes: Record<string, DisplayType> = {
  text: textDisplay,
  image: imageDisplay,
  link: linkDisplay,
  json: jsonDisplay,
  datetime: datetimeDisplay,
  color: colorDisplay,
  enum: enumDisplay,
  reference: referenceDisplay,
  markdown: markdownDisplay,
};

export function createDisplayTypeRegistry(
  custom?: Record<string, DisplayType>,
): Map<string, DisplayType> {
  const registry = new Map<string, DisplayType>();
  for (const [name, type] of Object.entries(builtinDisplayTypes)) {
    registry.set(name, type);
  }
  if (custom) {
    for (const [name, type] of Object.entries(custom)) {
      registry.set(name, type);
    }
  }
  return registry;
}
