import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, Repeat } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { useChannel } from "@/lib/realtime";
import { useAuth } from "@/lib/auth";
import type { BackgroundJob } from "@/lib/types";

export default function Jobs() {
  const qc = useQueryClient();
  const { user, loading } = useAuth();
  const enabled = !loading && user?.role === "admin";
  const { data: jobs = [] } = useQuery({ queryKey: ["jobs"], queryFn: api.listJobs, enabled, refetchOnMount: "always", retry: false });

  useChannel("background-job.updated", () => {
    qc.invalidateQueries({ queryKey: ["jobs"] });
  });

  const retry = useMutation({
    mutationFn: (id: string) => api.retryJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Job re-queued");
    },
  });

  const retryDLQ = useMutation({
    mutationFn: () => api.retryDeadLetterResumes(),
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success(`Re-queued ${count} dead-lettered resume jobs`);
    },
  });

  const stats = {
    queued: jobs.filter((job) => job.status === "queued").length,
    running: jobs.filter((job) => job.status === "running").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    dead: jobs.filter((job) => job.status === "dead_letter").length,
  };

  const columns: Column<BackgroundJob>[] = [
    { key: "id", header: "Job", cell: (row) => <span className="font-mono text-xs">{row.id}</span> },
    {
      key: "kind",
      header: "Kind",
      sortable: true,
      sortValue: (row) => row.kind,
      cell: (row) => <span className="capitalize">{row.kind.replace("_", " ")}</span>,
    },
    { key: "status", header: "Status", sortable: true, sortValue: (row) => row.status, cell: (row) => <StatusBadge value={row.status} /> },
    {
      key: "progress",
      header: "Progress",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${row.progress}%` }} />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{row.progress}%</span>
        </div>
      ),
    },
    {
      key: "attempts",
      header: "Attempts",
      cell: (row) => <span className="tabular-nums text-muted-foreground">{row.attempts}/{row.maxAttempts}</span>,
    },
    {
      key: "error",
      header: "Last error",
      cell: (row) => row.error ? <span className="line-clamp-1 text-xs text-[hsl(var(--destructive))]">{row.error}</span> : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      key: "actions",
      header: "",
      width: "1%",
      cell: (row) => (
        <Button
          size="sm"
          variant="outline"
          disabled={!["failed", "dead_letter"].includes(row.status)}
          onClick={() => retry.mutate(row.id)}
        >
          <RefreshCw className="mr-1.5 h-3 w-3" />
          Retry
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Background jobs"
        description="Monitor queue health, retry failures, and drain the dead-letter queue."
        actions={
          <div className="flex items-center gap-2">
            <ConnectionIndicator />
            <Button
              variant="outline"
              size="sm"
              onClick={() => retryDLQ.mutate()}
              disabled={retryDLQ.isPending || stats.dead === 0}
            >
              <Repeat className="mr-1.5 h-4 w-4" />
              Retry DLQ resumes
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Queued" value={stats.queued} />
        <StatCard label="Running" value={stats.running} hint="Realtime" />
        <StatCard label="Failed" value={stats.failed} />
        <StatCard label="Dead-letter" value={stats.dead} />
      </div>
      <DataTable
        data={jobs}
        columns={columns}
        rowKey={(row) => row.id}
        searchPlaceholder="Search id, kind, error..."
        searchKeys={(row) => `${row.id} ${row.kind} ${row.error ?? ""}`}
        pageSize={12}
      />
    </div>
  );
}
