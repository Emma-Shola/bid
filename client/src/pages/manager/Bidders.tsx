import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import type { User } from "@/lib/types";

export default function Bidders() {
  const navigate = useNavigate();
  const { data: bidders = [] } = useQuery({ queryKey: ["manager-bidders"], queryFn: api.listBidders });
  const { data: applications = [] } = useQuery({ queryKey: ["applications"], queryFn: () => api.listApplications() });

  const counts = applications.reduce<Record<string, number>>((acc, app) => {
    acc[app.bidderId] = (acc[app.bidderId] ?? 0) + 1;
    return acc;
  }, {});

  const interviews = applications.reduce<Record<string, number>>((acc, app) => {
    if (app.status === "interviewed") acc[app.bidderId] = (acc[app.bidderId] ?? 0) + 1;
    return acc;
  }, {});

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      sortValue: (row) => row.name,
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "email",
      header: "Email",
      cell: (row) => <span className="text-muted-foreground">{row.email}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge value={row.status} />,
    },
    {
      key: "apps",
      header: "Applied",
      cell: (row) => <span className="tabular-nums font-medium">{counts[row.id] ?? 0}</span>,
    },
    {
      key: "interviews",
      header: "Interviews",
      cell: (row) => (
        <span className="tabular-nums font-medium text-blue-600">{interviews[row.id] ?? 0}</span>
      ),
    },
    {
      key: "joined",
      header: "Joined",
      sortable: true,
      sortValue: (row) => row.createdAt,
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {format(new Date(row.createdAt), "MMM d, yyyy")}
        </span>
      ),
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
      <PageHeader title="Bidders" description="Click a bidder to view their applications." />
      <DataTable
        data={bidders}
        columns={columns}
        rowKey={(row) => row.id}
        searchPlaceholder="Search bidder..."
        searchKeys={(row) => `${row.name} ${row.email} ${row.username ?? ""}`}
        onRowClick={(row) => navigate(`/manager/bidders/${row.id}`)}
      />
    </div>
  );
}
