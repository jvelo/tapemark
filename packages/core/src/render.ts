import type { Child } from "hono/jsx";
import { renderToString } from "hono/jsx/dom/server";

export function renderPage(node: Child): string {
  return "<!DOCTYPE html>" + renderToString(node);
}

export function renderFragment(node: Child): string {
  return renderToString(node);
}
