/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  baseUrl: string;
}

export function Pagination({ page, pageSize, total, baseUrl }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const sep = baseUrl.includes("?") ? "&" : "?";
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div class="tm-pager">
      {page > 1 && (
        <a href={`${baseUrl}${sep}page=${page - 1}`}>prev</a>
      )}
      <span class="tm-pager-current">
        {from}–{to} of {total}
      </span>
      {page < totalPages && (
        <a href={`${baseUrl}${sep}page=${page + 1}`}>next</a>
      )}
    </div>
  );
}
