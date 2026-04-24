import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["application", id],
    queryFn: () => api.getApplication(id!),
    enabled: !!id,
  });

  const del = useMutation({
    mutationFn: () => api.deleteApplication(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Application deleted");
      navigate("/bidder/applications");
    },
  });

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.jobTitle}
        description={`${data.company} · ${data.status.replace("_", " ")}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/bidder/applications/${data.id}/edit`)}>
              <Pencil className="mr-1.5 h-4 w-4" /> Edit
            </Button>
            <Button variant="outline" onClick={() => del.mutate()}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Company</dt>
              <dd>{data.company}</dd>
              <dt className="text-muted-foreground">Job title</dt>
              <dd>{data.jobTitle}</dd>
              <dt className="text-muted-foreground">Submitted</dt>
              <dd className="tabular-nums">{format(new Date(data.submittedDate ?? data.createdAt ?? data.updatedAt), "PP")}</dd>
              <dt className="text-muted-foreground">Last update</dt>
              <dd className="tabular-nums">{format(new Date(data.updatedAt), "PPp")}</dd>
              {data.jobUrl && (
                <>
                  <dt className="text-muted-foreground">Job posting</dt>
                  <dd>
                    <a
                      href={data.jobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  </dd>
                </>
              )}
              {data.salaryMin || data.salaryMax ? (
                <>
                  <dt className="text-muted-foreground">Salary range</dt>
                  <dd>
                    {data.salaryMin ? `$${data.salaryMin.toLocaleString()}` : "—"}
                    {" - "}
                    {data.salaryMax ? `$${data.salaryMax.toLocaleString()}` : "—"}
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-2 text-sm font-semibold">Job description</h2>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.jobDescription}</p>
          </div>
          {data.notes && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-2 text-sm font-semibold">Notes</h2>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.notes}</p>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current status</p>
            <div className="mt-2">
              <StatusBadge value={data.status} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resume</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.resumeUrl ? "Linked resume available." : "No resume attached yet."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
