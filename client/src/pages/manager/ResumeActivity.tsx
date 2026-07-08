import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { downloadFromUrl } from "@/lib/download";

type ResumeReportRow = {
  id: string;
  createdAt: string;
  jobTitle: string;
  company: string;
  jobUrl: string;
  score: number | null;
  bidderName: string;
};

export default function ManagerResumeActivity() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["manager-resume-report"],
    queryFn: () => api.listManagerResumeReportRows(),
  });

  const columns: Column<ResumeReportRow>[] = [
    {
      key: "createdAt",
      header: "Date",
      sortable: true,
      sortValue: (row) => row.createdAt,
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">{format(new Date(row.createdAt), "MMM d, h:mm a")}</span>
      ),
    },
    {
      key: "company",
      header: "Company",
      sortable: true,
      sortValue: (row) => row.company,
      cell: (row) => <span className="font-medium">{row.company}</span>,
    },
    { key: "jobTitle", header: "Job Title", cell: (row) => row.jobTitle },
    {
      key: "link",
      header: "Link",
      cell: (row) =>
        row.jobUrl ? (
          <a href={row.jobUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 text-primary">
            Open
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "score",
      header: "ATS Score",
      sortable: true,
      sortValue: (row) => row.score ?? -1,
      className: "text-right",
      cell: (row) => (
        <span className="tabular-nums">{row.score != null ? `${Math.round(row.score)}%` : "—"}</span>
      ),
    },
    {
      key: "bidderName",
      header: "Bidded by",
      sortable: true,
      sortValue: (row) => row.bidderName,
      cell: (row) => row.bidderName,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resume activity"
        description="Resumes your bidders have marked as applied, across all of them."
        actions={
          <Button variant="outline" onClick={() => downloadFromUrl(api.getManagerResumeReportUrl())}>
            <Download className="mr-1.5 h-4 w-4" />
            Export to spreadsheet
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
          searchPlaceholder="Search company, role, or bidder..."
          searchKeys={(row) => `${row.company} ${row.jobTitle} ${row.bidderName}`}
        />
      )}
    </div>
  );
}
