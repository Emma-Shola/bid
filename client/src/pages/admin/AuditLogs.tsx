import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import type { AuditLog } from "@/lib/types";

export default function AuditLogs() {
  const { user, loading } = useAuth();
  const enabled = !loading && user?.role === "admin";
  const { data = [] } = useQuery({ queryKey: ["audit"], queryFn: api.auditLogs, enabled, refetchOnMount: "always", retry: false });

  const columns: Column<AuditLog>[] = [
    {
      key: "time",
      header: "Time",
      sortable: true,
      sortValue: (row) => row.createdAt,
      cell: (row) => <span className="tabular-nums text-muted-foreground">{format(new Date(row.createdAt), "MMM d, HH:mm:ss")}</span>,
    },
    { key: "actor", header: "Actor", cell: (row) => <span className="font-medium">{row.actorName}</span> },
    { key: "action", header: "Action", cell: (row) => <span className="font-mono text-xs">{row.action}</span> },
    { key: "target", header: "Target", cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.target}</span> },
    { key: "ip", header: "IP", cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.ip}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Audit logs" description="Immutable record of administrative and system actions." />
      <DataTable
        data={data}
        columns={columns}
        rowKey={(row) => row.id}
        searchPlaceholder="Search action, actor, target..."
        searchKeys={(row) => `${row.actorName} ${row.action} ${row.target} ${row.ip}`}
        pageSize={15}
      />
    </div>
  );
}
