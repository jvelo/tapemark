import { ErrorPage } from "./components/ErrorPage";
import { renderPage } from "./render";
import type { TapemarkResponse } from "./types";

interface ErrorPageContext {
  prefix: string;
  name: string;
  siteUrl?: string;
  siteName?: string;
  scripts?: string[];
}

export function renderErrorPage(
  status: number,
  message: string,
  ctx: ErrorPageContext,
): TapemarkResponse {
  const html = renderPage(
    <ErrorPage
      status={status}
      message={message}
      prefix={ctx.prefix}
      name={ctx.name}
      siteUrl={ctx.siteUrl}
      siteName={ctx.siteName}
      scripts={ctx.scripts}
    />,
  );
  return {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
    html,
  };
}
