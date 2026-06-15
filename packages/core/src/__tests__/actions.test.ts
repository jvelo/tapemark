/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { describe, it, expect } from "vitest";
import { groupActions, menuSlug, type ActionEntry } from "../actions";
import type { RowAction } from "../types";

function action(label: string, group?: string): RowAction {
  return { label, group, handler: () => ({ success: true }) };
}

function entries(...defs: [string, string, string?][]): ActionEntry[] {
  return defs.map(([name, label, group]) => [name, action(label, group)]);
}

describe("groupActions", () => {
  it("leaves ungrouped actions standalone", () => {
    const items = groupActions(entries(["a", "A"], ["b", "B"]));
    expect(items.map((i) => i.kind)).toEqual(["single", "single"]);
  });

  it("collapses actions sharing a group, in declared order", () => {
    const items = groupActions(
      entries(["csv", "CSV", "Export"], ["json", "JSON", "Export"]),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "group", label: "Export" });
    if (items[0].kind !== "group") throw new Error("expected group");
    expect(items[0].entries.map(([name]) => name)).toEqual(["csv", "json"]);
  });

  it("places a group at the position of its first member", () => {
    const items = groupActions(
      entries(["a", "A"], ["csv", "CSV", "Export"], ["b", "B"], ["json", "JSON", "Export"]),
    );
    expect(items.map((i) => (i.kind === "group" ? i.label : i.name))).toEqual([
      "a",
      "Export",
      "b",
    ]);
  });

  it("keeps distinct groups separate", () => {
    const items = groupActions(
      entries(["csv", "CSV", "Export"], ["pub", "Publish", "Status"]),
    );
    expect(items.map((i) => (i.kind === "group" ? i.label : i.name))).toEqual([
      "Export",
      "Status",
    ]);
  });
});

describe("menuSlug", () => {
  it("lowercases and dashes non-alphanumerics", () => {
    expect(menuSlug("Export")).toBe("export");
    expect(menuSlug("Change status")).toBe("change-status");
    expect(menuSlug("  Danger! Zone  ")).toBe("danger-zone");
  });

  it("falls back to a non-empty token for symbol-only labels", () => {
    expect(menuSlug("!!!")).toBe("group");
    expect(menuSlug("→")).toBe("group");
  });
});
