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

const cache = new Map<string, string>();

export function loadAsset(filename: string): string {
  const cached = cache.get(filename);
  if (cached !== undefined) return cached;
  const content = readFromDisk(filename);
  cache.set(filename, content);
  return content;
}

function readFromDisk(filename: string): string {
  if (!assetDir) return "";
  try {
    return readFileSync(resolve(assetDir, filename), "utf-8");
  } catch {
    return "";
  }
}
