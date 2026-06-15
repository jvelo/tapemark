/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { RowAction } from "./types";

export type ActionEntry = readonly [string, RowAction];

/** A standalone action button, or a dropdown holding several actions. */
export type ActionRenderItem =
  | { kind: "single"; name: string; action: RowAction }
  | { kind: "group"; label: string; entries: ActionEntry[] };

/** Partition action entries for rendering, preserving declared order. Actions
 *  sharing a `group` collapse into one dropdown that takes the position of the
 *  group's first member; ungrouped actions render standalone. */
export function groupActions(entries: ActionEntry[]): ActionRenderItem[] {
  const items: ActionRenderItem[] = [];
  const groups = new Map<string, ActionEntry[]>();
  for (const [name, action] of entries) {
    if (!action.group) {
      items.push({ kind: "single", name, action });
      continue;
    }
    const existing = groups.get(action.group);
    if (existing) {
      existing.push([name, action]);
      continue;
    }
    // The array is shared with the pushed item; later members mutate it in place.
    const grouped: ActionEntry[] = [[name, action]];
    groups.set(action.group, grouped);
    items.push({ kind: "group", label: action.group, entries: grouped });
  }
  return items;
}

/** Reduce a group label to an id-safe token for `popovertarget`/element ids. */
export function menuSlug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
