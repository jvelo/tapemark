/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { renderToString } from "hono/jsx/dom/server";
import type { Child } from "hono/jsx";

export function renderPage(node: Child): string {
  return "<!DOCTYPE html>" + renderToString(node);
}

export function renderFragment(node: Child): string {
  return renderToString(node);
}
