import type { Child } from "hono/jsx";

export interface Crumb {
  label: string;
  href?: string;
}

interface TapemarkLayoutProps {
  title: string;
  prefix: string;
  name: string;
  siteUrl?: string;
  siteName?: string;
  crumbs?: Crumb[];
  scripts?: string[];
  children?: Child;
}

export function TapemarkLayout({
  title,
  prefix,
  name,
  siteUrl,
  siteName = "site",
  crumbs = [],
  scripts = [],
  children,
}: TapemarkLayoutProps) {
  const cssHref = `${prefix}/_tapemark/styles.css`;
  const jsHref = `${prefix}/_tapemark/admin.js`;

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} — {name}</title>
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
              <a href={prefix || "/"}>{name}</a>
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
