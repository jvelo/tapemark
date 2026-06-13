/*
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { EventEmitter } from "node:events";
import { describe, it, expect } from "vitest";
import { parseFormBody } from "../http";
import type { IncomingMessage } from "node:http";

function fakeReq(): IncomingMessage & EventEmitter {
  const e = new EventEmitter() as IncomingMessage & EventEmitter;
  (e as unknown as { destroy: () => void }).destroy = () => {};
  return e;
}

describe("parseFormBody", () => {
  it("happy path: single data chunk resolves with parsed fields", async () => {
    const req = fakeReq();
    const promise = parseFormBody(req);
    queueMicrotask(() => {
      req.emit("data", Buffer.from("a=1&b=2"));
      req.emit("end");
    });
    await expect(promise).resolves.toEqual({ a: "1", b: "2" });
  });

  it("repeated keys: values collected into array", async () => {
    const req = fakeReq();
    const promise = parseFormBody(req);
    queueMicrotask(() => {
      req.emit("data", Buffer.from("tag=x&tag=y"));
      req.emit("end");
    });
    await expect(promise).resolves.toEqual({ tag: ["x", "y"] });
  });

  it("multibyte across chunks: decodes intact character", async () => {
    const req = fakeReq();
    // Raw UTF-8 body — é is bytes 0xC3 0xA9. Split BETWEEN those two bytes so
    // each chunk alone holds an incomplete sequence. Per-chunk toString() would
    // corrupt this (→ replacement chars); Buffer.concat-then-decode keeps it intact.
    const raw = Buffer.from("v=café", "utf8");
    const splitAt = raw.length - 1; // é is the last char; cut between its 2 bytes
    const promise = parseFormBody(req);
    queueMicrotask(() => {
      req.emit("data", raw.subarray(0, splitAt));
      req.emit("data", raw.subarray(splitAt));
      req.emit("end");
    });
    await expect(promise).resolves.toEqual({ v: "café" });
  });

  it("stream error: promise rejects", async () => {
    const req = fakeReq();
    const promise = parseFormBody(req);
    queueMicrotask(() => {
      req.emit("error", new Error("socket hang up"));
    });
    await expect(promise).rejects.toThrow("socket hang up");
  });

  it("oversized body: promise rejects", async () => {
    const req = fakeReq();
    const promise = parseFormBody(req);
    queueMicrotask(() => {
      req.emit("data", Buffer.alloc(5 * 1024 * 1024 + 1));
    });
    await expect(promise).rejects.toThrow("Request body too large");
  });
});
