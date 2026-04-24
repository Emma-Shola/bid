import { useWsStatus } from "@/lib/realtime";
import { cn } from "@/lib/utils";

export function ConnectionIndicator({ className }: { className?: string }) {
  const status = useWsStatus();
  const label = {
    connecting: "Connecting",
    open: "Live",
    reconnecting: "Reconnecting",
    closed: "Offline",
  }[status];
  const dot =
    status === "open"
      ? "bg-[hsl(var(--success))]"
      : status === "reconnecting" || status === "connecting"
        ? "bg-[hsl(var(--warning))]"
        : "bg-[hsl(var(--destructive))]";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground",
        className,
      )}
      title={`Realtime: ${label}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse-dot", dot)} />
      {label}
    </span>
  );
}
