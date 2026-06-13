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
    // "café" in URL-encoded form: café → caf%C3%A9
    // Split the UTF-8 Buffer of the encoded string at an odd byte boundary
    const encoded = Buffer.from("v=" + encodeURIComponent("café"));
    const mid = Math.floor(encoded.length / 2) + 1;
    const chunk1 = encoded.subarray(0, mid);
    const chunk2 = encoded.subarray(mid);
    const promise = parseFormBody(req);
    queueMicrotask(() => {
      req.emit("data", chunk1);
      req.emit("data", chunk2);
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
