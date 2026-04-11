import { TapemarkLayout } from "./TapemarkLayout";

interface ErrorPageProps {
  status: number;
  message: string;
  prefix: string;
  name: string;
  symbol: string | false;
  siteUrl?: string;
  siteName?: string;
  scripts?: string[];
}

const STATUS_LABELS: Record<number, string> = {
  400: "Bad Request",
  403: "Forbidden",
  404: "Not Found",
  500: "Internal Server Error",
};

export function ErrorPage({
  status,
  message,
  prefix,
  name,
  symbol,
  siteUrl,
  siteName,
  scripts,
}: ErrorPageProps) {
  const label = STATUS_LABELS[status] ?? `Error ${status}`;
  const displayMessage = message !== label ? message : undefined;

  return (
    <TapemarkLayout
      title={label}
      prefix={prefix}
      name={name}
      symbol={symbol}
      siteUrl={siteUrl}
      siteName={siteName}
      scripts={scripts}
    >
      <div class="tm-error">
        <span class="tm-error-status">{status}</span>
        <span class="tm-error-label">{label}</span>
        {displayMessage && <p class="tm-error-message">{displayMessage}</p>}
        <a href={prefix || "/"} class="tm-btn">back to tables</a>
      </div>
    </TapemarkLayout>
  );
}
