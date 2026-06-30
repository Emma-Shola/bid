import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { ChevronRight, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import type { User } from "@/lib/types";

function weekBounds() {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: 1 });
  const end = endOfWeek(now, { weekStartsOn: 1 });
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export default function BidderBids() {
  const navigate = useNavigate();
  const { start, end } = useMemo(weekBounds, []);

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.listUsers,
  });

  const { data: weekJobs = [] } = useQuery({
    queryKey: ["admin-resume-jobs-week", start.toISOString()],
    queryFn: () =>
      api.adminListResumeJobs({
        from: start.toISOString(),
        to: end.toISOString(),
        limit: 1000,
      }),
  });

  const bidders = useMemo(() => users.filter((u) => u.role === "bidder"), [users]);

  const weekCountByBidder = useMemo(() => {
    return weekJobs.reduce<Record<string, number>>((acc, job) => {
      acc[job.userId] = (acc[job.userId] ?? 0) + 1;
      return acc;
    }, {});
  }, [weekJobs]);

  const weekLabel = `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "Bidder",
      sortable: true,
      sortValue: (row) => row.name,
      cell: (row) => <span className="font-medium">{row.name || row.username}</span>,
    },
    {
      key: "email",
      header: "Email",
      cell: (row) => <span className="text-muted-foreground text-sm">{row.email}</span>,
    },
    {
      key: "week",
      header: `Bids this week`,
      sortable: true,
      sortValue: (row) => weekCountByBidder[row.id] ?? 0,
      cell: (row) => {
        const count = weekCountByBidder[row.id] ?? 0;
        return (
          <span className={`tabular-nums font-semibold ${count > 0 ? "text-primary" : "text-muted-foreground"}`}>
            {count}
          </span>
        );
      },
    },
    {
      key: "arrow",
      header: "",
      width: "40px",
      cell: () => <ChevronRight className="h-4 w-4 text-muted-foreground" />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bidder bids"
        description={`Resume generation activity by bidder — ${weekLabel}`}
        actions={
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="font-semibold tabular-nums">{weekJobs.length}</span>
            <span className="text-muted-foreground">total this week</span>
          </div>
        }
      />

      <DataTable
        data={bidders}
        columns={columns}
        rowKey={(row) => row.id}
        searchPlaceholder="Search bidder..."
        searchKeys={(row) => `${row.name} ${row.email} ${row.username ?? ""}`}
        onRowClick={(row) => navigate(`/admin/bidder-bids/${row.id}`)}
      />
    </div>
  );
}
