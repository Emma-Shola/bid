import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, Plus, Briefcase, CalendarCheck2, CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Application, ApplicationStatus } from "@/lib/types";

const STATUSES: ApplicationStatus[] = ["submitted", "reviewed", "interviewed", "rejected", "hired"];

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${color}`}>
      <span className="text-xl font-bold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function AddApplicationDialog({
  bidderId,
  open,
  onClose,
  onCreated,
}: {
  bidderId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    jobTitle: "",
    company: "",
    jobUrl: "",
    jobDescription: "",
    notes: "",
  });

  const create = useMutation({
    mutationFn: () => api.createApplicationForBidder(bidderId, form),
    onSuccess: () => {
      toast.success("Application added");
      setForm({ jobTitle: "", company: "", jobUrl: "", jobDescription: "", notes: "" });
      onCreated();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to add application"),
  });

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add application</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Job title *</Label>
              <Input placeholder="e.g. Software Engineer" {...field("jobTitle")} />
            </div>
            <div className="space-y-1.5">
              <Label>Company *</Label>
              <Input placeholder="e.g. Google" {...field("company")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Job URL</Label>
            <Input placeholder="https://..." {...field("jobUrl")} />
          </div>

          <div className="space-y-1.5">
            <Label>Job description *</Label>
            <Textarea
              rows={5}
              placeholder="Paste or type the job description…"
              {...field("jobDescription")}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} placeholder="Any internal notes…" {...field("notes")} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !form.jobTitle.trim() ||
                !form.company.trim() ||
                !form.jobDescription.trim() ||
                create.isPending
              }
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Adding…" : "Add application"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BidderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: bidders = [] } = useQuery({
    queryKey: ["manager-bidders"],
    queryFn: api.listBidders,
  });

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["applications", "bidder", id],
    queryFn: () => api.listApplications({ bidderId: id }),
    enabled: !!id,
    refetchOnMount: "always",
  });

  const update = useMutation({
    mutationFn: ({ appId, status }: { appId: string; status: ApplicationStatus }) =>
      api.updateApplication(appId, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications", "bidder", id] });
      toast.success("Status updated");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update"),
  });

  const bidder = bidders.find((b) => b.id === id);

  const stats = {
    total: applications.length,
    interviews: applications.filter((a) => a.status === "interviewed").length,
    hired: applications.filter((a) => a.status === "hired").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={bidder?.name ?? "Bidder"}
        description={bidder?.email ?? ""}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/manager/bidders")}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add application
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <StatPill label="Total applied" value={stats.total} color="border-border bg-card" />
        <StatPill label="Interviews" value={stats.interviews} color="border-blue-200 bg-blue-50 text-blue-900" />
        <StatPill label="Hired" value={stats.hired} color="border-emerald-200 bg-emerald-50 text-emerald-900" />
        <StatPill label="Rejected" value={stats.rejected} color="border-red-200 bg-red-50 text-red-900" />
      </div>

      {/* Applications */}
      <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Applications</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Update the status of each application or add a new one.
          </p>
        </div>

        {isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading…</p>
        ) : applications.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No applications yet.{" "}
            <button
              className="text-primary underline underline-offset-2"
              onClick={() => setAddOpen(true)}
            >
              Add one
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {applications.map((app: Application) => (
              <div
                key={app.id}
                className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{app.jobTitle}</p>
                    <span className="text-xs text-muted-foreground">·</span>
                    <p className="text-sm text-muted-foreground truncate">{app.company}</p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <StatusBadge value={app.status} />
                    <span>
                      {format(
                        new Date(app.appliedAt ?? app.createdAt ?? app.updatedAt),
                        "MMM d, yyyy",
                      )}
                    </span>
                    {app.jobUrl && (
                      <a
                        href={app.jobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" />
                        View job
                      </a>
                    )}
                    {app.notes && <span className="italic">"{app.notes}"</span>}
                  </div>
                </div>

                <Select
                  value={app.status}
                  onValueChange={(value) =>
                    update.mutate({ appId: app.id, status: value as ApplicationStatus })
                  }
                >
                  <SelectTrigger className="h-8 w-[145px] shrink-0 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize text-xs">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </section>

      <AddApplicationDialog
        bidderId={id!}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["applications", "bidder", id] })}
      />
    </div>
  );
}
