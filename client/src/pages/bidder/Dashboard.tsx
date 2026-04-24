import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import type { Application } from "@/lib/types";
import { format } from "date-fns";

export default function BidderDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ["applications", "bidder", user?.id],
    queryFn: () => api.listApplications({ bidderId: user!.id }),
    enabled: !!user,
  });

  const totals = {
    all: data.length,
    active: data.filter((application) => ["submitted", "reviewed", "interviewed"].includes(application.status)).length,
    interviews: data.filter((application) => application.status === "interviewed").length,
    offers: data.filter((application) => application.status === "hired").length,
  };

  const columns: Column<Application>[] = [
    {
      key: "company",
      header: "Company",
      sortable: true,
      sortValue: (row) => row.company,
      cell: (row) => <span className="font-medium text-foreground">{row.company}</span>,
    },
    {
      key: "title",
      header: "Role",
      cell: (row) => <span className="text-muted-foreground">{row.jobTitle}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sortValue: (row) => row.status,
      cell: (row) => <StatusBadge value={row.status} />,
    },
    {
      key: "submitted",
      header: "Submitted",
      sortable: true,
      sortValue: (row) => row.submittedDate ?? row.createdAt ?? row.updatedAt,
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {format(new Date(row.submittedDate ?? row.createdAt ?? row.updatedAt), "MMM d, yyyy")}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(" ")[0] ?? "there"}`}
        description="A quick view of your active applications and recent activity."
        actions={
          <Button onClick={() => navigate("/bidder/applications/new")}>
            <Plus className="mr-1.5 h-4 w-4" />
            New application
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total applications" value={totals.all} hint="All time" />
        <StatCard label="In progress" value={totals.active} hint="Open pipeline" />
        <StatCard label="Interviews" value={totals.interviews} />
        <StatCard label="Offers" value={totals.offers} trend={{ value: "+2", positive: true }} />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Recent applications</h2>
        {isLoading ? (
          <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">Loading...</div>
        ) : (
          <DataTable
            data={data}
            columns={columns}
            rowKey={(row) => row.id}
            searchKeys={(row) => `${row.company} ${row.jobTitle} ${row.jobDescription}`}
            onRowClick={(row) => navigate(`/bidder/applications/${row.id}`)}
            pageSize={8}
          />
        )}
      </div>
    </div>
  );
}
