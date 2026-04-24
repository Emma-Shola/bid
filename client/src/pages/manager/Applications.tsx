import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import type { Application, ApplicationStatus } from "@/lib/types";

const STATUSES = ["all", "submitted", "reviewed", "interviewed", "rejected", "hired"];

export default function ManagerApplications() {
  const [status, setStatus] = useState("all");
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["applications", "manager", status],
    queryFn: () => api.listApplications({ status }),
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) => api.updateApplication(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Status updated");
    },
  });

  const columns: Column<Application>[] = [
    {
      key: "bidder",
      header: "Bidder",
      sortable: true,
      sortValue: (row) => row.bidderName,
      cell: (row) => <span className="font-medium">{row.bidderName}</span>,
    },
    {
      key: "company",
      header: "Company",
      sortable: true,
      sortValue: (row) => row.company,
      cell: (row) => row.company,
    },
    { key: "role", header: "Role", cell: (row) => <span className="text-muted-foreground">{row.jobTitle}</span> },
    { key: "status", header: "Status", sortable: true, sortValue: (row) => row.status, cell: (row) => <StatusBadge value={row.status} /> },
    {
      key: "submitted",
      header: "Submitted",
      sortable: true,
      sortValue: (row) => row.submittedDate ?? row.createdAt ?? row.updatedAt,
      cell: (row) => <span className="tabular-nums text-muted-foreground">{format(new Date(row.submittedDate ?? row.createdAt ?? row.updatedAt), "MMM d")}</span>,
    },
    {
      key: "actions",
      header: "",
      width: "1%",
      cell: (row) => (
        <Select value={row.status} onValueChange={(value) => update.mutate({ id: row.id, status: value as ApplicationStatus })}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.filter((option) => option !== "all").map((option) => (
              <SelectItem key={option} value={option} className="capitalize">
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="Review, filter, and progress applications across all bidders."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const rows = [
                ["Bidder", "Company", "Job Title", "Status", "Submitted", "Notes"],
                ...data.map((item) => [
                  item.bidderName,
                  item.company,
                  item.jobTitle,
                  item.status,
                  item.submittedDate ?? item.createdAt ?? "",
                  item.notes ?? "",
                ]),
              ];
              const csv = rows
                .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
                .join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "applications.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV
          </Button>
        }
      />
      {isLoading ? (
        <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">Loading...</div>
      ) : (
        <DataTable
          data={data}
          columns={columns}
          rowKey={(row) => row.id}
          searchPlaceholder="Search bidder, company, or role..."
          searchKeys={(row) => `${row.bidderName} ${row.company} ${row.jobTitle} ${row.jobDescription}`}
          toolbar={
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((option) => (
                  <SelectItem key={option} value={option} className="capitalize">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      )}
    </div>
  );
}
