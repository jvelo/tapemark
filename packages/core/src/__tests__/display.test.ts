import { describe, it, expect } from "vitest";
import { builtinDisplayTypes, createDisplayTypeRegistry } from "../display";
import type { DisplayType } from "../types";

describe("builtinDisplayTypes", () => {
  it("includes all expected types", () => {
    const names = Object.keys(builtinDisplayTypes);
    expect(names).toEqual(
      expect.arrayContaining([
        "text", "image", "link", "json", "datetime", "color", "enum", "markdown", "uuid",
      ]),
    );
  });

  it("text truncates long strings at 80 chars", () => {
    const long = "a".repeat(100);
    const html = builtinDisplayTypes.text.render(long, {});
    expect(html).toBe("a".repeat(80) + "…");
  });

  it("text escapes HTML", () => {
    const html = builtinDisplayTypes.text.render("<script>alert(1)</script>", {});
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("image renders a tm-image-cell web component", () => {
    const html = builtinDisplayTypes.image.render("https://example.com/img.png", {});
    expect(html).toContain("<tm-image-cell");
    expect(html).toContain('data-src="https://example.com/img.png"');
    expect(html).toContain('data-height="48"');
    expect(html).toContain('data-preview="240"');
  });

  it("image returns empty for falsy value", () => {
    expect(builtinDisplayTypes.image.render("", {})).toBe("");
    expect(builtinDisplayTypes.image.render(null, {})).toBe("");
  });

  it("link renders an anchor tag", () => {
    const html = builtinDisplayTypes.link.render("https://example.com", {});
    expect(html).toContain("<a");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
  });

  it("json formats valid JSON", () => {
    const html = builtinDisplayTypes.json.render('{"key":"value"}', {});
    expect(html).toContain("<code");
    expect(html).toContain("key");
  });

  it("json handles invalid JSON gracefully", () => {
    const html = builtinDisplayTypes.json.render("not json", {});
    expect(html).toContain("not json");
  });

  it("color renders a swatch", () => {
    const html = builtinDisplayTypes.color.render("#ff0000", {});
    expect(html).toContain("tm-swatch");
    expect(html).toContain("#ff0000");
  });

  it("enum renders a badge", () => {
    const html = builtinDisplayTypes.enum.render("active", {
      colors: { active: "#4a4" },
    });
    expect(html).toContain("tm-cell-enum");
    expect(html).toContain("#4a4");
  });

  it("uuid renders a monospace code cell", () => {
    const html = builtinDisplayTypes.uuid.render("df123ad0-ff54-4a87-bce3-488186567e63", {});
    expect(html).toContain('class="tm-cell-uuid"');
    expect(html).toContain("df123ad0-ff54-4a87-bce3-488186567e63");
    expect(html).toMatch(/^<code/);
  });

  it("uuid truncates when the option is set", () => {
    const html = builtinDisplayTypes.uuid.render("df123ad0-ff54-4a87-bce3-488186567e63", { truncate: 8 });
    expect(html).toContain("df123ad0…");
    expect(html).not.toContain("488186567e63");
  });

  it("uuid returns empty for falsy value", () => {
    expect(builtinDisplayTypes.uuid.render("", {})).toBe("");
    expect(builtinDisplayTypes.uuid.render(null, {})).toBe("");
  });

  it("each type has a valid schema", () => {
    for (const type of Object.values(builtinDisplayTypes)) {
      expect(type.schema.type).toBe("object");
      expect(type.schema.properties).toBeDefined();
    }
  });
});

describe("createDisplayTypeRegistry", () => {
  it("includes all builtins", () => {
    const registry = createDisplayTypeRegistry();
    expect(registry.size).toBeGreaterThanOrEqual(10);
    expect(registry.has("text")).toBe(true);
    expect(registry.has("image")).toBe(true);
    expect(registry.has("uuid")).toBe(true);
  });

  it("merges custom types", () => {
    const custom: DisplayType = {
      name: "custom",
      description: "A custom type",
      schema: { type: "object", properties: {} },
      render: (v) => String(v),
    };
    const registry = createDisplayTypeRegistry({ custom });
    expect(registry.has("custom")).toBe(true);
    expect(registry.has("text")).toBe(true); // builtins still there
  });

  it("custom types can override builtins", () => {
    const override: DisplayType = {
      name: "text",
      description: "Override",
      schema: { type: "object", properties: {} },
      render: () => "overridden",
    };
    const registry = createDisplayTypeRegistry({ text: override });
    expect(registry.get("text")!.render("x", {})).toBe("overridden");
  });
});
