import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import type { User } from "@/lib/types";

export default function Bidders() {
  const { data: bidders = [] } = useQuery({ queryKey: ["manager-bidders"], queryFn: api.listBidders });
  const { data: applications = [] } = useQuery({ queryKey: ["applications"], queryFn: () => api.listApplications() });
  const counts = applications.reduce<Record<string, number>>((acc, application) => {
    acc[application.bidderId] = (acc[application.bidderId] ?? 0) + 1;
    return acc;
  }, {});

  const columns: Column<User>[] = [
    { key: "name", header: "Name", sortable: true, sortValue: (row) => row.name, cell: (row) => <span className="font-medium">{row.name}</span> },
    { key: "email", header: "Email", cell: (row) => <span className="text-muted-foreground">{row.email}</span> },
    { key: "status", header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
    { key: "apps", header: "Applications", cell: (row) => <span className="tabular-nums">{counts[row.id] ?? 0}</span>, className: "text-right" },
    { key: "joined", header: "Joined", sortable: true, sortValue: (row) => row.createdAt, cell: (row) => <span className="tabular-nums text-muted-foreground">{format(new Date(row.createdAt), "MMM d, yyyy")}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Bidders" description="Bidders assigned to your manager account." />
      <DataTable
        data={bidders}
        columns={columns}
        rowKey={(row) => row.id}
        searchPlaceholder="Search bidder..."
        searchKeys={(row) => `${row.name} ${row.email} ${row.username ?? ""}`}
      />
    </div>
  );
}
