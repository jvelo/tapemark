/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { TapemarkLayout } from "./TapemarkLayout";

export interface DatabaseListItem {
  name: string;
  path: string;
}

interface DatabaseListPageProps {
  databases: DatabaseListItem[];
}

export function DatabaseListPage({ databases }: DatabaseListPageProps) {
  return (
    <TapemarkLayout
      title="databases"
      prefix=""
      name="tapemark"
      symbol="🎞️"
    >
      <h2 class="tm-section-title">databases</h2>
      <table class="tm-table-compact">
        <thead>
          <tr>
            <th>name</th>
            <th>path</th>
          </tr>
        </thead>
        <tbody>
          {databases.map((db) => (
            <tr>
              <td>
                <a href={`/${db.name}`}>{db.name}</a>
              </td>
              <td class="tm-muted">{db.path}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TapemarkLayout>
  );
}
