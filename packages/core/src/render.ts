import { type VNode } from "preact";
import renderToString from "preact-render-to-string";

/**
 * Render a Preact VNode to a full HTML string (with doctype).
 * This is the single entry point for all server-side rendering.
 */
export function renderPage(vnode: VNode): string {
  return "<!DOCTYPE html>" + renderToString(vnode);
}

/**
 * Render a Preact VNode to an HTML fragment string (no doctype).
 * Used for partial rendering (e.g. display type cell content).
 */
export function renderFragment(vnode: VNode): string {
  return renderToString(vnode);
}
