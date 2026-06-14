/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

/** Max accepted request body (bytes). Admin form posts are tiny; this only
 *  guards against unbounded in-memory growth. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

export function parseFormBody(
  req: IncomingMessage,
): Promise<Record<string, string | string[]>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const data = Buffer.concat(chunks).toString("utf-8");
      const result: Record<string, string | string[]> = {};
      for (const [key, value] of new URLSearchParams(data)) {
        const existing = result[key];
        if (existing) {
          result[key] = Array.isArray(existing)
            ? [...existing, value]
            : [existing, value];
        } else {
          result[key] = value;
        }
      }
      resolve(result);
    });
    req.on("error", reject);
  });
}

type TapemarkResponse = {
  status: number;
  headers: Record<string, string>;
  html?: string;
  redirect?: string;
};

export function sendResponse(res: ServerResponse, tapemarkRes: TapemarkResponse): void {
  if (tapemarkRes.redirect) {
    res.writeHead(tapemarkRes.status, {
      location: tapemarkRes.redirect,
      ...tapemarkRes.headers,
    });
    res.end();
    return;
  }
  res.writeHead(tapemarkRes.status, tapemarkRes.headers);
  res.end(tapemarkRes.html ?? "");
}
