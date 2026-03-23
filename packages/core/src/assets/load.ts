// Assets are loaded differently depending on the environment:
// - Vite build: the build plugin replaces these with inlined content
// - Node.js dev (tsx/vitest): reads from filesystem at runtime

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
  try {
    // Dynamic requires to avoid bundler issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const url = require("node:url");
    const dir = path.dirname(url.fileURLToPath(import.meta.url));
    return fs.readFileSync(path.resolve(dir, filename), "utf-8");
  } catch {
    return "";
  }
}
