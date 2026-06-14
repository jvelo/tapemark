/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { TapemarkResponse } from "../types";

export function redirect(url: string, status = 302): TapemarkResponse {
  return { status, headers: { location: url }, redirect: url };
}
