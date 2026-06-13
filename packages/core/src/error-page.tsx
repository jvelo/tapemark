/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { ErrorPage } from "./components/ErrorPage";
import { renderPage } from "./render";
import type { TapemarkResponse } from "./types";

interface ErrorPageContext {
  prefix: string;
  name: string;
  symbol: string | false;
  siteUrl?: string;
  siteName?: string;
  scripts?: string[];
}

export function renderErrorPage(
  status: number,
  message: string,
  ctx: ErrorPageContext,
): TapemarkResponse {
  const html = renderPage(
    <ErrorPage
      status={status}
      message={message}
      prefix={ctx.prefix}
      name={ctx.name}
      symbol={ctx.symbol}
      siteUrl={ctx.siteUrl}
      siteName={ctx.siteName}
      scripts={ctx.scripts}
    />,
  );
  return {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
    html,
  };
}
