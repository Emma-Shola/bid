import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { useChannel } from "@/lib/realtime";
import type { BackgroundJob } from "@/lib/types";
import { Button } from "@/components/ui/button";

export default function AdminOverview() {
  const qc = useQueryClient();
  const { user, loading } = useAuth();
  const enabled = !loading && user?.role === "admin";
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: api.listUsers, enabled, refetchOnMount: "always", retry: false });
  const { data: pending = [] } = useQuery({ queryKey: ["pending-users"], queryFn: api.pendingUsers, enabled, refetchOnMount: "always", retry: false });
  const { data: jobs = [] } = useQuery({ queryKey: ["jobs"], queryFn: api.listJobs, enabled, refetchOnMount: "always", retry: false });

  useChannel("background-job.updated", () => {
    qc.invalidateQueries({ queryKey: ["jobs"] });
  });

  const running = jobs.filter((job) => job.status === "running").length;
  const failed = jobs.filter((job) => job.status === "failed").length;
  const dead = jobs.filter((job) => job.status === "dead_letter").length;

  const columns: Column<BackgroundJob>[] = [
    { key: "id", header: "Job", cell: (row) => <span className="font-mono text-xs">{row.id}</span> },
    { key: "kind", header: "Kind", cell: (row) => <span className="capitalize">{row.kind.replace("_", " ")}</span> },
    { key: "status", header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
    {
      key: "progress",
      header: "Progress",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${row.progress}%` }} />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{row.progress}%</span>
        </div>
      ),
    },
    { key: "attempts", header: "Attempts", cell: (row) => <span className="tabular-nums text-muted-foreground">{row.attempts}/{row.maxAttempts}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="System overview"
        description="High-level account and platform health."
        actions={<ConnectionIndicator />}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total users" value={users.length} />
        <StatCard label="Pending approvals" value={pending.length} hint={pending.length > 0 ? "Action needed" : "All clear"} />
        <StatCard label="Jobs running" value={running} hint="Realtime" />
        <StatCard label="Failed / DLQ" value={failed + dead} trend={dead ? { value: `${dead} dead`, positive: false } : undefined} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Live job activity</h2>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/monitor">Open monitor</Link>
          </Button>
        </div>
        <DataTable data={jobs.slice(0, 8)} columns={columns} rowKey={(row) => row.id} searchable={false} pageSize={8} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Pending approvals</h2>
        {pending.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No accounts waiting for approval.
          </div>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-border bg-card">
            {pending.slice(0, 5).map((user) => (
              <li key={user.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email} · requested {format(new Date(user.createdAt), "MMM d, HH:mm")}</p>
                </div>
                <StatusBadge value={user.role} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
