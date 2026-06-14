/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { DatabaseListPage, type DatabaseListItem } from "./components/DatabaseListPage";
import { renderPage } from "./render";

export function renderDatabaseListPage(databases: DatabaseListItem[]): string {
  return renderPage(<DatabaseListPage databases={databases} />);
}
