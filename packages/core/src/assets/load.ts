// Assets are loaded differently depending on the environment:
// - Vite build: the build plugin replaces this entire module with inlined content
// - Node.js dev (tsx/vitest): reads from filesystem at runtime

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let assetDir: string;
try {
  assetDir = dirname(fileURLToPath(import.meta.url));
} catch {
  assetDir = "";
}

let CSS_CACHE: string | undefined;
let JS_CACHE: string | undefined;

export function loadAsset(filename: string): string {
  if (filename === "tapemark.css") {
    if (CSS_CACHE !== undefined) return CSS_CACHE;
    CSS_CACHE = readFromDisk(filename);
    return CSS_CACHE;
  }
  if (filename === "tapemark.js") {
    if (JS_CACHE !== undefined) return JS_CACHE;
    JS_CACHE = readFromDisk(filename);
    return JS_CACHE;
  }
  return "";
}

function readFromDisk(filename: string): string {
  if (!assetDir) return "";
  try {
    return readFileSync(resolve(assetDir, filename), "utf-8");
  } catch {
    return "";
  }
}
