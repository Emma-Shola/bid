import { cn } from "@/lib/utils";

type Variant = "neutral" | "info" | "success" | "warning" | "destructive" | "muted";

const styles: Record<Variant, string> = {
  neutral:
    "bg-secondary text-secondary-foreground ring-1 ring-inset ring-border",
  info: "bg-[hsl(var(--info)/0.1)] text-[hsl(var(--info))] ring-1 ring-inset ring-[hsl(var(--info)/0.25)]",
  success:
    "bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))] ring-1 ring-inset ring-[hsl(var(--success)/0.25)]",
  warning:
    "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))] ring-1 ring-inset ring-[hsl(var(--warning)/0.3)]",
  destructive:
    "bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))] ring-1 ring-inset ring-[hsl(var(--destructive)/0.25)]",
  muted:
    "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
};

const map: Record<string, Variant> = {
  // applications
  submitted: "info",
  reviewed: "info",
  interviewed: "warning",
  hired: "success",
  rejected: "destructive",
  // users
  pending: "warning",
  active: "success",
  suspended: "destructive",
  // payments
  paid: "success",
  failed: "destructive",
  refunded: "muted",
  // jobs
  queued: "muted",
  running: "info",
  succeeded: "success",
  processing: "info",
  retrying: "warning",
  completed: "success",
  dead_letter: "destructive",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const v = map[value] ?? "neutral";
  const label = value.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium capitalize tabular-nums",
        styles[v],
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          v === "success" && "bg-[hsl(var(--success))]",
          v === "warning" && "bg-[hsl(var(--warning))]",
          v === "destructive" && "bg-[hsl(var(--destructive))]",
          v === "info" && "bg-[hsl(var(--info))]",
          (v === "muted" || v === "neutral") && "bg-muted-foreground/60",
        )}
      />
      {label}
    </span>
  );
}
