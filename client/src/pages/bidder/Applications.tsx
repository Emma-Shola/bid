import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import type { Application } from "@/lib/types";

const STATUSES = ["all", "submitted", "reviewed", "interviewed", "rejected", "hired"];

export default function BidderApplications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["applications", "bidder", user?.id, status],
    queryFn: () => api.listApplications({ bidderId: user!.id, status }),
    enabled: !!user,
  });

  const columns: Column<Application>[] = [
    {
      key: "company",
      header: "Company",
      sortable: true,
      sortValue: (row) => row.company,
      cell: (row) => <span className="font-medium">{row.company}</span>,
    },
    {
      key: "title",
      header: "Role",
      cell: (row) => row.jobTitle,
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
          {format(new Date(row.submittedDate ?? row.createdAt ?? row.updatedAt), "MMM d")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "1%",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/bidder/applications/${row.id}/edit`);
            }}
          >
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="All jobs you've applied to."
        actions={
          <Button onClick={() => navigate("/bidder/applications/new")}>
            <Plus className="mr-1.5 h-4 w-4" />
            New application
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
          searchPlaceholder="Search company or role..."
          searchKeys={(row) => `${row.company} ${row.jobTitle} ${row.jobDescription}`}
          onRowClick={(row) => navigate(`/bidder/applications/${row.id}`)}
          toolbar={
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Status" />
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
