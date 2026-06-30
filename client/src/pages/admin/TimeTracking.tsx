import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Timer, Circle } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import type { TimeEntry } from "@/lib/types";

function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export default function TimeTracking() {
  const { user, loading } = useAuth();
  const enabled = !loading && user?.role === "admin";

  const { data = [] } = useQuery({
    queryKey: ["admin-time-entries"],
    queryFn: api.adminTimeEntries,
    enabled,
    refetchOnMount: "always",
    refetchInterval: 30_000,
    retry: false,
  });

  const activeCount = data.filter((e) => e.isActive).length;

  const columns: Column<TimeEntry>[] = [
    {
      key: "status",
      header: "Status",
      cell: (row) =>
        row.isActive ? (
          <span className="inline-flex items-center gap-1.5 text-green-600 font-medium text-xs">
            <Circle className="h-2 w-2 fill-green-500 stroke-none animate-pulse" />
            Active
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Completed</span>
        ),
    },
    {
      key: "bidder",
      header: "Bidder",
      cell: (row) => <span className="font-medium">{row.bidderName}</span>,
    },
    {
      key: "clockedIn",
      header: "Clocked In",
      sortable: true,
      sortValue: (row) => row.clockedInAt,
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground text-sm">
          {format(new Date(row.clockedInAt), "MMM d, HH:mm:ss")}
        </span>
      ),
    },
    {
      key: "clockedOut",
      header: "Clocked Out",
      cell: (row) =>
        row.clockedOutAt ? (
          <span className="tabular-nums text-muted-foreground text-sm">
            {format(new Date(row.clockedOutAt), "MMM d, HH:mm:ss")}
          </span>
        ) : (
          <span className="text-muted-foreground/50 text-sm">—</span>
        ),
    },
    {
      key: "duration",
      header: "Duration",
      cell: (row) =>
        row.isActive ? (
          <span className="text-green-600 font-mono text-xs">Running</span>
        ) : row.durationSecs != null ? (
          <span className="font-mono text-xs tabular-nums">{formatDuration(row.durationSecs)}</span>
        ) : (
          <span className="text-muted-foreground/50 text-sm">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Time Tracking"
        description="Live view of bidder clock-in and clock-out activity."
      />

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3">
          <Timer className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Currently working</p>
            <p className="text-2xl font-bold tabular-nums">{activeCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">Total entries today</p>
            <p className="text-2xl font-bold tabular-nums">
              {
                data.filter(
                  (e) =>
                    new Date(e.clockedInAt).toDateString() === new Date().toDateString()
                ).length
              }
            </p>
          </div>
        </div>
      </div>

      <DataTable
        data={data}
        columns={columns}
        rowKey={(row) => row.id}
        searchPlaceholder="Search bidder name..."
        searchKeys={(row) => row.bidderName}
        pageSize={20}
      />
    </div>
  );
}
