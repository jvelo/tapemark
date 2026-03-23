interface FlashProps {
  type?: string;
  message?: string;
}

export function Flash({ type, message }: FlashProps) {
  if (!message) return null;
  const isError = type === "error";
  const cls = isError ? "tm-flash tm-flash-error" : "tm-flash tm-flash-success";
  const prefix = isError ? "\u2717 " : "\u2192 ";
  return (
    <div class={cls} id="tm-flash">
      {prefix}
      {message}
    </div>
  );
}
