interface FlashProps {
  type?: string;
  message?: string;
}

export function Flash({ type, message }: FlashProps) {
  if (!message) return null;
  let cls: string;
  let prefix: string;
  if (type === "error") {
    cls = "tm-flash tm-flash-error";
    prefix = "✗ ";
  } else if (type === "warning") {
    cls = "tm-flash tm-flash-warning";
    prefix = "⚠ ";
  } else {
    cls = "tm-flash tm-flash-success";
    prefix = "→ ";
  }
  return (
    <div class={cls} id="tm-flash">
      {prefix}
      {message}
    </div>
  );
}
