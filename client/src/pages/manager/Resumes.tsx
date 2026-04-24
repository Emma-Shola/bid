import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import type { ResumeTemplate } from "@/lib/types";

export default function ManagerResumes() {
  const { data: resumes = [] } = useQuery({
    queryKey: ["resumes", "manager"],
    queryFn: () => api.listResumes(),
  });

  const columns: Column<ResumeTemplate>[] = [
    {
      key: "title",
      header: "Title",
      sortable: true,
      sortValue: (row) => row.title,
      cell: (row) => <span className="font-medium">{row.title}</span>,
    },
    {
      key: "chars",
      header: "Text Size",
      sortable: true,
      sortValue: (row) => row.textLength,
      className: "text-right",
      cell: (row) => <span className="tabular-nums">{row.textLength.toLocaleString()}</span>,
    },
    {
      key: "file",
      header: "Source File",
      cell: (row) =>
        row.fileUrl ? (
          <a href={row.fileUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Open file
          </a>
        ) : (
          <span className="text-muted-foreground">Text-only</span>
        ),
    },
    {
      key: "created",
      header: "Created",
      sortable: true,
      sortValue: (row) => row.createdAt,
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">{format(new Date(row.createdAt), "MMM d, yyyy")}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Resume Templates" description="Templates assigned to your manager account." />
      <DataTable
        data={resumes}
        columns={columns}
        rowKey={(row) => row.id}
        searchPlaceholder="Search template..."
        searchKeys={(row) => `${row.title} ${row.fileUrl ?? ""}`}
      />
    </div>
  );
}

