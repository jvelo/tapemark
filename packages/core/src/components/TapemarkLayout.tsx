import type { ComponentChildren } from "preact";

export interface Crumb {
  label: string;
  href?: string;
}

interface TapemarkLayoutProps {
  title: string;
  prefix: string;
  crumbs?: Crumb[];
  scripts?: string[];
  children?: ComponentChildren;
}

export function TapemarkLayout({
  title,
  prefix,
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
        <title>{title} — tapemark</title>
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
              <a href={prefix || "/"}>tapemark</a>
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
          </div>
          <div class="tm-body">{children}</div>
        </div>
      </body>
    </html>
  );
}
