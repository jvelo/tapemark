import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load a static asset as a string. Uses fs.readFileSync — works in
 * Node.js, Bun, and Deno. For Cloudflare Workers (no fs), the Vite
 * build inlines these via the library bundle.
 */
export function loadAsset(filename: string): string {
  return readFileSync(resolve(__dirname, filename), "utf-8");
}
