import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

export default function Approvals() {
  const qc = useQueryClient();
  const { user, loading } = useAuth();
  const enabled = !loading && user?.role === "admin";
  const { data = [] } = useQuery({
    queryKey: ["pending-users"],
    queryFn: api.pendingUsers,
    enabled,
    refetchOnMount: "always",
    retry: false,
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.approveUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-users"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User approved");
    },
  });

  const columns: Column<User>[] = [
    { key: "name", header: "Name", cell: (row) => <span className="font-medium">{row.name}</span> },
    { key: "email", header: "Email", cell: (row) => <span className="text-muted-foreground">{row.email}</span> },
    { key: "role", header: "Requested role", cell: (row) => <StatusBadge value={row.role} /> },
    { key: "requested", header: "Requested", sortable: true, sortValue: (row) => row.createdAt, cell: (row) => <span className="tabular-nums text-muted-foreground">{format(new Date(row.createdAt), "MMM d, HH:mm")}</span> },
    {
      key: "actions",
      header: "",
      width: "1%",
      cell: (row) => (
        <Button size="sm" onClick={() => approve.mutate(row.id)}>
          <Check className="mr-1.5 h-4 w-4" /> Approve
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Pending approvals" description="Review and approve new account requests." />
      <DataTable
        data={data}
        columns={columns}
        rowKey={(row) => row.id}
        searchPlaceholder="Search name or email..."
        searchKeys={(row) => `${row.name} ${row.email}`}
        emptyTitle="No pending approvals"
        emptyDescription="New account requests will appear here."
      />
    </div>
  );
}
