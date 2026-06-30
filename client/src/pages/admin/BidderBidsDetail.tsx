import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

function weekBounds() {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: 1 });
  const end = endOfWeek(now, { weekStartsOn: 1 });
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function statusColor(status: string) {
  if (status === "completed") return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (status === "qa_required") return "text-amber-600 bg-amber-50 border-amber-200";
  if (status === "failed" || status === "dead_letter") return "text-red-600 bg-red-50 border-red-200";
  if (status === "processing" || status === "retrying") return "text-blue-600 bg-blue-50 border-blue-200";
  return "text-muted-foreground bg-muted border-border";
}

export default function BidderBidsDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { start, end } = useMemo(weekBounds, []);

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.listUsers,
  });

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["admin-bidder-resume-jobs", id, start.toISOString()],
    queryFn: () =>
      api.adminListResumeJobs({
        userId: id,
        from: start.toISOString(),
        to: end.toISOString(),
        limit: 1000,
      }),
    enabled: !!id,
  });

  const bidder = useMemo(() => users.find((u) => u.id === id), [users, id]);

  const days = useMemo(() => eachDayOfInterval({ start, end }), [start, end]);

  const jobsByDay = useMemo(() => {
    return jobs.reduce<Record<string, typeof jobs>>((acc, job) => {
      const key = format(new Date(job.createdAt), "yyyy-MM-dd");
      if (!acc[key]) acc[key] = [];
      acc[key].push(job);
      return acc;
    }, {});
  }, [jobs]);

  const weekLabel = `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={bidder?.name || bidder?.username || "Bidder"}
        description={`Resume bids — ${weekLabel}`}
        actions={
          <Button variant="outline" onClick={() => navigate("/admin/bidder-bids")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            All bidders
          </Button>
        }
      />

      {/* Week summary */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Week summary</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{weekLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums">{jobs.length}</p>
            <p className="text-xs text-muted-foreground">total this week</p>
          </div>
        </div>

        {isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="divide-y divide-border">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayJobs = jobsByDay[key] ?? [];
              const isToday = format(new Date(), "yyyy-MM-dd") === key;
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between px-5 py-3.5 ${isToday ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-16 text-sm font-medium text-foreground">
                      {format(day, "EEE")}
                      {isToday && (
                        <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          today
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{format(day, "MMM d")}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`tabular-nums font-semibold text-sm ${dayJobs.length > 0 ? "text-primary" : "text-muted-foreground"}`}>
                      {dayJobs.length} {dayJobs.length === 1 ? "bid" : "bids"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Job list */}
      {jobs.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">All bids this week</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Most recent first</p>
          </div>

          <div className="divide-y divide-border">
            {[...jobs].reverse().map((job) => {
              const jobTitle =
                typeof job.payload?.jobTitle === "string" ? job.payload.jobTitle : "Untitled";
              const company =
                typeof job.payload?.company === "string" ? job.payload.company : "—";
              const jobUrl =
                typeof job.payload?.jobUrl === "string" ? job.payload.jobUrl : null;
              return (
                <div key={job.id} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{jobTitle}</p>
                      <span className="text-xs text-muted-foreground">·</span>
                      <p className="text-sm text-muted-foreground">{company}</p>
                      {jobUrl && (
                        <a
                          href={jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline truncate max-w-[200px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {jobUrl}
                        </a>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {format(new Date(job.createdAt), "EEE, MMM d 'at' h:mm a")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${statusColor(job.status)}`}
                  >
                    {job.status.replace(/_/g, " ")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isLoading && jobs.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No bids this week yet.
        </div>
      )}
    </div>
  );
}
