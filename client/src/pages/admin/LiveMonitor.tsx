import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { StatusBadge } from "@/components/StatusBadge";
import { useChannel } from "@/lib/realtime";
import { useAuth } from "@/lib/auth";
import type { BackgroundJob } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function LiveMonitor() {
  const qc = useQueryClient();
  const { user, loading } = useAuth();
  const enabled = !loading && user?.role === "admin";
  const { data: jobs = [] } = useQuery({ queryKey: ["jobs"], queryFn: api.listJobs, enabled, refetchOnMount: "always", retry: false });

  useChannel("background-job.updated", () => {
    qc.invalidateQueries({ queryKey: ["jobs"] });
  });

  const active = jobs.filter((job) => job.status === "running" || job.status === "queued");
  const recent = jobs.filter((job) => job.status === "succeeded" || job.status === "failed").slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live monitor"
        description="Real-time view of job execution across the worker fleet."
        actions={<ConnectionIndicator />}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Active</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{active.length} jobs</span>
          </header>
          <ul className="divide-y divide-border">
            {active.length === 0 && (
              <li className="p-6 text-center text-sm text-muted-foreground">No active jobs.</li>
            )}
            {active.map((job) => (
              <li key={job.id} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize">{job.kind.replace("_", " ")}</p>
                    <p className="font-mono text-2xs text-muted-foreground">{job.id}</p>
                  </div>
                  <StatusBadge value={job.status} />
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full transition-all duration-500",
                      job.status === "running" ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-2xs tabular-nums text-muted-foreground">
                  <span>{job.progress}%</span>
                  <span>
                    attempt {job.attempts}/{job.maxAttempts}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Recent completions</h2>
          </header>
          <ul className="divide-y divide-border">
            {recent.map((job) => (
              <li key={job.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize">{job.kind.replace("_", " ")}</p>
                  <p className="font-mono text-2xs text-muted-foreground">{job.id}</p>
                </div>
                <StatusBadge value={job.status} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
