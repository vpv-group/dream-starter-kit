import { cn } from "@acme/ui";

/** A workspace's logo, or its initial on a `foreground` tile. */
export function WorkspaceMark({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        className={cn("size-12 rounded-lg object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "bg-foreground text-background flex size-12 shrink-0 items-center justify-center rounded-lg text-lg font-semibold",
        className,
      )}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
