import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  trend,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  trend?: { value: string; positive?: boolean };
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        {trend && (
          <span
            className={cn(
              "text-xs font-medium",
              trend.positive ? "text-[hsl(var(--success))]" : "text-[hsl(var(--destructive))]",
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
