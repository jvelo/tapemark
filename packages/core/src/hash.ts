/**
 * Compute a SHA-256 hex digest.
 * Uses Web Crypto API (Node 20+, Cloudflare Workers, Deno) with
 * a fallback to Node.js crypto module.
 */
export async function computeHash(input: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const data = new TextEncoder().encode(input);
    const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input).digest("hex");
}
