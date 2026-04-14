import { describe, it, expect } from "vitest";
import { builtinEditorTypes, createEditorTypeRegistry } from "../editor";
import type { Column, EditorType } from "../types";

const textColumn: Column = {
  name: "name",
  rawType: "TEXT",
  affinity: "text",
  nullable: true,
  defaultValue: null,
  primaryKeyPosition: null,
};

const requiredTextColumn: Column = { ...textColumn, nullable: false };

describe("builtinEditorTypes", () => {
  it("registers all expected editors", () => {
    expect(Object.keys(builtinEditorTypes)).toEqual(
      expect.arrayContaining([
        "text",
        "textarea",
        "number",
        "color",
        "datetime",
        "url",
        "enum",
        "checkbox",
        "reference",
      ]),
    );
  });

  it("text editor emits a plain input", () => {
    const html = builtinEditorTypes.text.render(textColumn, "hello", {});
    expect(html).toContain('type="text"');
    expect(html).toContain('name="name"');
    expect(html).toContain('value="hello"');
    expect(html).not.toContain("list=");
    expect(html).not.toContain("required");
  });

  it("text editor emits list attr when suggest is true", () => {
    const html = builtinEditorTypes.text.render(textColumn, "", { suggest: true });
    expect(html).toContain('list="tm-suggest-name"');
  });

  it("text editor emits required when flag is set", () => {
    const html = builtinEditorTypes.text.render(requiredTextColumn, "", {}, { required: true });
    expect(html).toContain("required");
  });

  it("textarea editor emits a textarea with rows option", () => {
    const html = builtinEditorTypes.textarea.render(textColumn, "long text", { rows: 6 });
    expect(html).toContain("<textarea");
    expect(html).toContain('rows="6"');
    expect(html).toContain(">long text</textarea>");
  });

  it("number editor respects step option", () => {
    const html = builtinEditorTypes.number.render(textColumn, 42, { step: "1" });
    expect(html).toContain('type="number"');
    expect(html).toContain('step="1"');
    expect(html).toContain('value="42"');
  });

  it("color editor defaults empty value to #000000", () => {
    const html = builtinEditorTypes.color.render(textColumn, null, {});
    expect(html).toContain('type="color"');
    expect(html).toContain('value="#000000"');
  });

  it("datetime editor uses datetime-local type", () => {
    const html = builtinEditorTypes.datetime.render(textColumn, "2026-01-01T12:00", {});
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain('value="2026-01-01T12:00"');
  });

  it("url editor uses url type", () => {
    const html = builtinEditorTypes.url.render(textColumn, "https://example.com", {});
    expect(html).toContain('type="url"');
    expect(html).toContain('value="https://example.com"');
  });

  it("enum editor parses comma-separated values", () => {
    const html = builtinEditorTypes.enum.render(textColumn, "b", { values: "a,b,c" });
    expect(html).toContain("<select");
    expect(html).toContain('<option value="a">a</option>');
    expect(html).toContain('<option value="b" selected>b</option>');
    expect(html).toContain('<option value="c">c</option>');
  });

  it("enum editor parses JSON map values", () => {
    const html = builtinEditorTypes.enum.render(textColumn, "a", {
      values: '{"a":"Apple","b":"Banana"}',
    });
    expect(html).toContain('<option value="a" selected>Apple</option>');
    expect(html).toContain('<option value="b">Banana</option>');
  });

  it("enum editor includes empty option for nullable columns", () => {
    const html = builtinEditorTypes.enum.render(textColumn, "", { values: "a,b" });
    expect(html).toContain('<option value="" selected>');
  });

  it("enum editor omits empty option for non-nullable columns", () => {
    const html = builtinEditorTypes.enum.render(requiredTextColumn, "a", { values: "a,b" });
    expect(html).not.toContain('<option value="">');
  });

  it("checkbox editor emits a hidden fallback + checkbox", () => {
    const html = builtinEditorTypes.checkbox.render(textColumn, "1", {});
    expect(html).toContain('type="hidden"');
    expect(html).toContain('value="0"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('value="1"');
    expect(html).toContain("checked");
  });

  it("reference editor emits tm-reference-input when table is set", () => {
    const html = builtinEditorTypes.reference.render(
      textColumn,
      "42",
      { table: "users", labelColumn: "name" },
    );
    expect(html).toContain('<tm-reference-input data-table="users"');
    expect(html).toContain('data-column="name"');
    expect(html).toContain('data-value="42"');
    expect(html).toContain('data-label-column="name"');
    expect(html).toContain('type="hidden"');
  });

  it("reference editor falls back to plain input without table option", () => {
    const html = builtinEditorTypes.reference.render(textColumn, "42", {});
    expect(html).toContain('type="text"');
    expect(html).not.toContain("<tm-reference-input");
  });
});

describe("createEditorTypeRegistry", () => {
  it("includes all builtins", () => {
    const registry = createEditorTypeRegistry();
    for (const name of Object.keys(builtinEditorTypes)) {
      expect(registry.has(name)).toBe(true);
    }
  });

  it("merges custom editors", () => {
    const custom: EditorType = {
      name: "slug",
      description: "slug input",
      schema: { type: "object", properties: {} },
      render: (col) => `<input name="${col.name}" pattern="[a-z-]+" />`,
    };
    const registry = createEditorTypeRegistry({ slug: custom });
    expect(registry.get("slug")).toBe(custom);
  });

  it("custom editors can override builtins", () => {
    const replacement: EditorType = {
      name: "text",
      description: "custom text",
      schema: { type: "object", properties: {} },
      render: () => "<input data-custom />",
    };
    const registry = createEditorTypeRegistry({ text: replacement });
    expect(registry.get("text")).toBe(replacement);
  });
});
