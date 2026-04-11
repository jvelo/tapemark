import { renderToString } from "hono/jsx/dom/server";
import type { Child } from "hono/jsx";

export function renderPage(node: Child): string {
  return "<!DOCTYPE html>" + renderToString(node);
}

export function renderFragment(node: Child): string {
  return renderToString(node);
}
