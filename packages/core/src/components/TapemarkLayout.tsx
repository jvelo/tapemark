import type { Child } from "hono/jsx";

export interface Crumb {
  label: string;
  href?: string;
}

interface TapemarkLayoutProps {
  title: string;
  prefix: string;
  name: string;
  symbol: string | false;
  siteUrl?: string;
  siteName?: string;
  crumbs?: Crumb[];
  scripts?: string[];
  children?: Child;
}

/** Build an inline-SVG data URL favicon rendering the given text as emoji. */
function faviconDataUrl(text: string): string {
  const encoded = encodeURIComponent(text);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>` +
    `<text y='.9em' font-size='90'>${encoded}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function TapemarkLayout({
  title,
  prefix,
  name,
  symbol,
  siteUrl,
  siteName = "site",
  crumbs = [],
  scripts = [],
  children,
}: TapemarkLayoutProps) {
  const cssHref = `${prefix}/_tapemark/styles.css`;
  const jsHref = `${prefix}/_tapemark/admin.js`;
  const titleText = symbol ? `${symbol} ${title} — ${name}` : `${title} — ${name}`;

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{titleText}</title>
        {symbol && <link rel="icon" href={faviconDataUrl(symbol)} />}
        <link rel="stylesheet" href={cssHref} />
        <script src={jsHref} defer></script>
        {scripts.map((src) => (
          <script src={src} defer></script>
        ))}
      </head>
      <body>
        <div class="tm">
          <div class="tm-bar">
            <span class="tm-bar-title">
              <a href={prefix || "/"}>
                {symbol && (
                  <>
                    <span class="tm-symbol" aria-hidden="true">{symbol}</span>{" "}
                  </>
                )}
                {name}
              </a>
            </span>
            {crumbs.length > 0 && (
              <div class="tm-crumbs">
                {crumbs.map((c, i) => (
                  <>
                    {i > 0 && <span>/</span>}
                    {c.href ? (
                      <a href={c.href}>{c.label}</a>
                    ) : (
                      <span>{c.label}</span>
                    )}
                  </>
                ))}
              </div>
            )}
            {siteUrl && (
              <a href={siteUrl} class="tm-bar-site">{"\u2190 "}{siteName}</a>
            )}
          </div>
          <div class="tm-body">{children}</div>
        </div>
      </body>
    </html>
  );
}
