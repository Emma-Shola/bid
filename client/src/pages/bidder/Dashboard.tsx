import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Eye,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useChannel, type RealtimeEvent } from "@/lib/realtime";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { DataTable, type Column } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { downloadFromUrl } from "@/lib/download";
import type { BackgroundJob } from "@/lib/types";

type QueueStatusFilter = "all" | "queued" | "running" | "succeeded" | "qa_required" | "failed";
type QueueSortMode = "newest" | "oldest" | "fastest" | "slowest";
type DetailTab = "overview" | "description" | "resume" | "qa" | "activity";

const statusOrder: QueueStatusFilter[] = ["queued", "running", "succeeded", "qa_required", "failed"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getJobTitle(job: BackgroundJob) {
  const payload = asRecord(job.payload);
  return typeof payload.jobTitle === "string" && payload.jobTitle.trim() ? payload.jobTitle : "Untitled role";
}

function getJobCompany(job: BackgroundJob) {
  const payload = asRecord(job.payload);
  return typeof payload.company === "string" && payload.company.trim() ? payload.company : "Unknown company";
}

function getJobDescription(job: BackgroundJob) {
  const payload = asRecord(job.payload);
  return typeof payload.jobDescription === "string" ? payload.jobDescription : "";
}

function getGeneratedResumeId(job: BackgroundJob) {
  const result = asRecord(job.result);
  const meta = asRecord(result.meta);
  const id = meta.generatedResumeId;
  return typeof id === "string" && id.trim() ? id : "";
}

function getUiStatus(job: BackgroundJob): QueueStatusFilter {
  if (job.status === "queued") return "queued";
  if (job.status === "running") return "running";
  if (job.status === "succeeded") return "succeeded";
  if (job.status === "qa_required") return "qa_required";
  return "failed";
}

function getStatusMeta(job: BackgroundJob) {
  const status = getUiStatus(job);
  switch (status) {
    case "queued":
      return { label: "Queued", icon: Clock3, className: "bg-muted text-muted-foreground" };
    case "running":
      return { label: "Generating", icon: LoaderCircle, className: "bg-[hsl(var(--info)/0.12)] text-[hsl(var(--info))]" };
    case "succeeded":
      return { label: "Downloaded", icon: CheckCircle2, className: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]" };
    case "qa_required":
      return { label: "Q&A Required", icon: MessageSquareText, className: "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]" };
    case "failed":
    default:
      return { label: "Failed", icon: TriangleAlert, className: "bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]" };
  }
}

function getProgressValue(job: BackgroundJob) {
  switch (getUiStatus(job)) {
    case "queued":
      return 0;
    case "running":
      return job.progress && job.progress > 0 ? Math.min(job.progress, 95) : 55;
    case "qa_required":
      return 100;
    case "succeeded":
      return 100;
    case "failed":
    default:
      return 100;
  }
}

function formatQueueDuration(job: BackgroundJob) {
  const start = job.startedAt ? new Date(job.startedAt) : new Date(job.createdAt);
  const end =
    job.finishedAt && ["succeeded", "failed", "qa_required"].includes(getUiStatus(job))
      ? new Date(job.finishedAt)
      : new Date();
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

function formatQueueTime(value?: string) {
  if (!value) return "—";
  return format(new Date(value), "MMM d, p");
}

function formatQueueTimestamp(value?: string) {
  if (!value) return "—";
  return format(new Date(value), "MMM d, h:mm a");
}

function buildJobSearchText(job: BackgroundJob) {
  return [
    job.id,
    job.kind,
    job.status,
    getJobTitle(job),
    getJobCompany(job),
    getJobDescription(job),
    job.error ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function buildJobAnswerContext(job: BackgroundJob) {
  return {
    jobTitle: getJobTitle(job),
    company: getJobCompany(job),
    jobDescription: getJobDescription(job),
  };
}

export default function BidderDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all");
  const [sortMode, setSortMode] = useState<QueueSortMode>("newest");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<DetailTab>("overview");
  const [isLive, setIsLive] = useState(true);
  const [qaQuestion, setQaQuestion] = useState("Why do you feel interested in this role?");
  const [qaAnswer, setQaAnswer] = useState("");
  const [qaKeyPoints, setQaKeyPoints] = useState<string[]>([]);
  const [qaFollowUps, setQaFollowUps] = useState<string[]>([]);

  const {
    data: jobs = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["bidder-jobs", user?.id],
    queryFn: () => api.listBidderJobs(),
    enabled: !!user,
    refetchOnWindowFocus: isLive,
    refetchInterval: isLive ? 10_000 : false,
    retry: false,
  });

  useChannel<RealtimeEvent<{ jobId: string; type: string; status: string }>>(
    "background-job.updated",
    () => {
      if (!isLive) return;
      qc.invalidateQueries({ queryKey: ["bidder-jobs", user?.id] });
    },
  );

  const filteredJobs = useMemo(() => {
    let list = jobs.filter((job) => job.kind === "resume_generate");
    if (statusFilter !== "all") {
      list = list.filter((job) => getUiStatus(job) === statusFilter);
    }

    return [...list].sort((a, b) => {
      const at = new Date(a.createdAt).getTime();
      const bt = new Date(b.createdAt).getTime();
      const ad = new Date(a.finishedAt ?? a.startedAt ?? a.createdAt).getTime() - at;
      const bd = new Date(b.finishedAt ?? b.startedAt ?? b.createdAt).getTime() - bt;

      switch (sortMode) {
        case "oldest":
          return at - bt;
        case "fastest":
          return ad - bd;
        case "slowest":
          return bd - ad;
        case "newest":
        default:
          return bt - at;
      }
    });
  }, [jobs, statusFilter, sortMode]);

  useEffect(() => {
    if (!filteredJobs.length) {
      setSelectedJobId(null);
      return;
    }

    if (!selectedJobId || !filteredJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(filteredJobs[0].id);
    }
  }, [filteredJobs, selectedJobId]);

  const selectedJob = filteredJobs.find((job) => job.id === selectedJobId) ?? filteredJobs[0] ?? null;
  const selectedResult = selectedJob ? asRecord(selectedJob.result) : {};

  useEffect(() => {
    setQaAnswer("");
    setQaKeyPoints([]);
    setQaFollowUps([]);
  }, [selectedJobId]);

  const queueStats = {
    queued: jobs.filter((job) => getUiStatus(job) === "queued").length,
    generating: jobs.filter((job) => getUiStatus(job) === "running").length,
    downloaded: jobs.filter((job) => getUiStatus(job) === "succeeded").length,
    qa: jobs.filter((job) => getUiStatus(job) === "qa_required").length,
    failed: jobs.filter((job) => getUiStatus(job) === "failed").length,
  };

  const answerMutation = useMutation({
    mutationFn: async () => {
      if (!selectedJob) {
        throw new Error("Select a job first.");
      }

      const context = buildJobAnswerContext(selectedJob);
      return api.askInterviewQuestion({
        question: qaQuestion.trim(),
        jobTitle: context.jobTitle,
        company: context.company,
        jobDescription: context.jobDescription,
      });
    },
    onSuccess: (result) => {
      setQaAnswer(result.answer);
      setQaKeyPoints(result.keyPoints || []);
      setQaFollowUps(result.followUpQuestions || []);
      toast.success("Answer ready");
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to generate answer");
    },
  });

  async function handleCopyAnswer() {
    if (!qaAnswer.trim()) return;
    await navigator.clipboard.writeText(qaAnswer);
    toast.success("Answer copied");
  }

  const columns: Column<BackgroundJob>[] = [
    {
      key: "index",
      header: "#",
      width: "56px",
      cell: (row) => (
        <span className="tabular-nums text-xs text-muted-foreground">
          {filteredJobs.findIndex((job) => job.id === row.id) + 1}
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{getJobTitle(row)}</p>
          <p className="truncate text-xs text-muted-foreground">{getJobCompany(row)}</p>
        </div>
      ),
    },
    {
      key: "submitted",
      header: "Submitted",
      cell: (row) => (
        <div className="text-sm">
          <p className="tabular-nums text-foreground">{formatQueueTime(row.createdAt)}</p>
          <p className="text-xs text-muted-foreground">{formatQueueTimestamp(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => {
        const meta = getStatusMeta(row);
        const Icon = meta.icon;
        return (
          <span
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              meta.className,
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
          </span>
        );
      },
    },
    {
      key: "duration",
      header: "Duration",
      cell: (row) => (
        <div className="min-w-[72px]">
          <div className="tabular-nums text-sm text-foreground">{formatQueueDuration(row)}</div>
          <div className="text-xs text-muted-foreground">{getUiStatus(row) === "queued" ? "Waiting" : "Processing"}</div>
        </div>
      ),
    },
    {
      key: "progress",
      header: "Progress",
      cell: (row) => {
        const progress = getProgressValue(row);
        const status = getUiStatus(row);
        return (
          <div className="min-w-[140px]">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={[
                  "h-full rounded-full transition-all duration-500",
                  status === "running" ? "bg-primary/90 animate-pulse" : "",
                  status === "queued" ? "bg-muted-foreground/50" : "",
                  status === "succeeded" ? "bg-[hsl(var(--success))]" : "",
                  status === "qa_required" ? "bg-[hsl(var(--warning))]" : "",
                  status === "failed" ? "bg-[hsl(var(--destructive))]" : "",
                ].join(" ")}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{status === "queued" ? "Queued" : status === "running" ? "Generating" : status === "qa_required" ? "Q&A" : status === "succeeded" ? "Done" : "Failed"}</span>
              <span>{progress}%</span>
            </div>
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      width: "220px",
      cell: (row) => {
        const generatedResumeId = getGeneratedResumeId(row);
        return (
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                setSelectedJobId(row.id);
                setSelectedTab("overview");
              }}
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              View
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                setSelectedJobId(row.id);
                setSelectedTab("qa");
              }}
            >
              <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
              Ask AI
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!generatedResumeId || getUiStatus(row) !== "succeeded"}
              onClick={(event) => {
                event.stopPropagation();
                if (!generatedResumeId) return;
                downloadFromUrl(api.getGeneratedResumeExportUrl(generatedResumeId, "pdf"));
              }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              PDF
            </Button>
          </div>
        );
      },
    },
  ];

  const toolbar = (
    <>
      <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as QueueStatusFilter)}>
        <SelectTrigger className="h-9 w-[165px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="queued">Queued</SelectItem>
          <SelectItem value="running">Generating</SelectItem>
          <SelectItem value="succeeded">Downloaded</SelectItem>
          <SelectItem value="qa_required">Q&A Required</SelectItem>
          <SelectItem value="failed">Failed</SelectItem>
        </SelectContent>
      </Select>

      <Select value={sortMode} onValueChange={(value) => setSortMode(value as QueueSortMode)}>
        <SelectTrigger className="h-9 w-[165px]">
          <SelectValue placeholder="Newest first" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest first</SelectItem>
          <SelectItem value="oldest">Oldest first</SelectItem>
          <SelectItem value="fastest">Fastest first</SelectItem>
          <SelectItem value="slowest">Slowest first</SelectItem>
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" onClick={() => refetch()}>
        <RefreshCw className="mr-1.5 h-4 w-4" />
        Refresh
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsLive((value) => !value)}
      >
        {isLive ? "Pause Queue" : "Resume Queue"}
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Active Queue"
        description="A dense operations dashboard for running, reviewing, and downloading tailored resume jobs."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/bidder/interview")}>
              <MessageSquareText className="mr-1.5 h-4 w-4" />
              Interview AI
            </Button>
            <Button onClick={() => navigate("/bidder/resume")}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Generate Resume
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Queued" value={queueStats.queued} hint="Waiting jobs" />
        <StatCard label="Generating" value={queueStats.generating} hint="Live workers" />
        <StatCard label="Downloaded" value={queueStats.downloaded} hint="Ready to deliver" />
        <StatCard label="Q&A" value={queueStats.qa} hint="Needs review" />
        <StatCard label="Failed" value={queueStats.failed} hint="Needs attention" />
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Job queue</h2>
            <p className="text-xs text-muted-foreground">
              Click a row to open the detailed job panel. {isLive ? "Live updates are on." : "Live updates are paused."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {jobs.length} total
            </span>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {queueStats.generating} in flight
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-md border border-border bg-muted/20 p-8 text-sm text-muted-foreground">Loading queue...</div>
        ) : (
          <DataTable
            data={filteredJobs}
            columns={columns}
            rowKey={(row) => row.id}
            searchPlaceholder="Search jobs, roles, companies..."
            searchKeys={(row) => buildJobSearchText(row)}
            pageSize={12}
            onRowClick={(row) => {
              setSelectedJobId(row.id);
              setSelectedTab("overview");
            }}
            toolbar={toolbar}
          />
        )}
      </div>

      {selectedJob ? (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Expanded job</p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">{getJobTitle(selectedJob)}</h2>
              <p className="text-sm text-muted-foreground">{getJobCompany(selectedJob)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
                Submitted {formatQueueTimestamp(selectedJob.createdAt)}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const generatedResumeId = getGeneratedResumeId(selectedJob);
                  if (!generatedResumeId) return;
                  downloadFromUrl(api.getGeneratedResumeExportUrl(generatedResumeId, "pdf"));
                }}
                disabled={!getGeneratedResumeId(selectedJob) || getUiStatus(selectedJob) !== "succeeded"}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Download PDF
              </Button>
            </div>
          </div>

          <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as DetailTab)}>
            <TabsList className="mb-4 grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="description">Job Description</TabsTrigger>
              <TabsTrigger value="resume">Resume</TabsTrigger>
              <TabsTrigger value="qa">Q&A</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{getStatusMeta(selectedJob).label}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Duration</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{formatQueueDuration(selectedJob)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Attempts</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {selectedJob.attempts}/{selectedJob.maxAttempts}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Generated resume</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {getGeneratedResumeId(selectedJob) ? "Available" : "Not ready"}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Payload</p>
                  <dl className="mt-3 grid grid-cols-2 gap-y-3 text-sm">
                    <dt className="text-muted-foreground">Role</dt>
                    <dd>{getJobTitle(selectedJob)}</dd>
                    <dt className="text-muted-foreground">Company</dt>
                    <dd>{getJobCompany(selectedJob)}</dd>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd>{formatQueueTimestamp(selectedJob.createdAt)}</dd>
                    <dt className="text-muted-foreground">Started</dt>
                    <dd>{formatQueueTimestamp(selectedJob.startedAt)}</dd>
                  </dl>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Actions</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedTab("qa");
                        toast.info("Ask interview questions from the Q&A tab.");
                      }}
                    >
                      <MessageSquareText className="mr-1.5 h-4 w-4" />
                      Ask AI
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!getGeneratedResumeId(selectedJob) || getUiStatus(selectedJob) !== "succeeded"}
                      onClick={() => {
                        const id = getGeneratedResumeId(selectedJob);
                        if (!id) return;
                        downloadFromUrl(api.getGeneratedResumeExportUrl(id, "pdf"));
                      }}
                    >
                      <Download className="mr-1.5 h-4 w-4" />
                      Download PDF
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const params = new URLSearchParams({
                          jobTitle: getJobTitle(selectedJob),
                          company: getJobCompany(selectedJob),
                          jobDescription: getJobDescription(selectedJob),
                        });
                        navigate(`/bidder/interview?${params.toString()}`);
                      }}
                    >
                      <Sparkles className="mr-1.5 h-4 w-4" />
                      Open coach
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="description">
              <div className="flex items-center justify-between gap-2 rounded-t-lg border border-border border-b-0 bg-muted/20 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Job description</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const text = getJobDescription(selectedJob);
                    if (!text.trim()) return;
                    await navigator.clipboard.writeText(text);
                    toast.success("Job description copied");
                  }}
                >
                  <Copy className="mr-1.5 h-4 w-4" />
                  Copy JD
                </Button>
              </div>
              <ScrollArea className="h-[340px] rounded-b-lg border border-border bg-background">
                <div className="p-4">
                  <Textarea
                    value={getJobDescription(selectedJob)}
                    readOnly
                    className="min-h-[280px] resize-none border-0 bg-transparent p-0 font-mono text-xs leading-6 shadow-none focus-visible:ring-0"
                  />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="resume" className="space-y-4">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-4 py-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resume preview</p>
                  <p className="text-sm text-muted-foreground">Use the latest generated output for this queue item.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!getGeneratedResumeId(selectedJob) || getUiStatus(selectedJob) !== "succeeded"}
                    onClick={() => {
                      const id = getGeneratedResumeId(selectedJob);
                      if (!id) return;
                      downloadFromUrl(api.getGeneratedResumeExportUrl(id, "pdf"));
                    }}
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!getGeneratedResumeId(selectedJob) || getUiStatus(selectedJob) !== "succeeded"}
                    onClick={() => {
                      const id = getGeneratedResumeId(selectedJob);
                      if (!id) return;
                      downloadFromUrl(api.getGeneratedResumeExportUrl(id, "docx"));
                    }}
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    DOCX
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                {selectedResult.resumeMarkdown || selectedResult.preview ? (
                  <ScrollArea className="h-[360px]">
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-6 text-foreground">
                      {String(selectedResult.resumeMarkdown || selectedResult.preview)}
                    </pre>
                  </ScrollArea>
                ) : (
                  <div className="rounded-md border border-dashed border-border p-8 text-sm text-muted-foreground">
                    Once the job finishes, the generated resume preview will appear here.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="qa" className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ask AI about this job</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use the job description and latest resume context to produce interview-ready answers.
                </p>
                <div className="mt-4 space-y-3">
                  <Textarea
                    rows={5}
                    value={qaQuestion}
                    onChange={(event) => setQaQuestion(event.target.value)}
                    placeholder="What are your salary expectations?"
                  />
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Why are you interested in this role?",
                      "Tell me about a difficult technical decision you made.",
                      "Describe a project you led end to end.",
                      "How do you handle tradeoffs between speed and reliability?",
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setQaQuestion(prompt)}
                        className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => answerMutation.mutate()} disabled={answerMutation.isPending}>
                      <Sparkles className="mr-1.5 h-4 w-4" />
                      {answerMutation.isPending ? "Generating..." : "Generate Answer"}
                    </Button>
                    <Button variant="outline" onClick={handleCopyAnswer} disabled={!qaAnswer.trim()}>
                      <Copy className="mr-1.5 h-4 w-4" />
                      Copy Answer
                    </Button>
                  </div>
                </div>
              </div>

              {qaAnswer ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-background p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Answer</p>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                        Executive tone
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{qaAnswer}</p>
                  </div>

                  {qaKeyPoints.length > 0 && (
                    <div className="rounded-lg border border-border bg-muted/20 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key points</p>
                      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                        {qaKeyPoints.map((point) => (
                          <li key={point} className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {qaFollowUps.length > 0 && (
                    <div className="rounded-lg border border-border bg-muted/20 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Follow-up questions</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {qaFollowUps.map((item) => (
                          <span key={item} className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-background p-8 text-sm text-muted-foreground">
                  Ask a question and the response will appear here. The answer is grounded in the selected job context.
                </div>
              )}
            </TabsContent>

            <TabsContent value="activity">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Activity timeline</p>
                <div className="mt-4 space-y-4">
                  {[
                    { label: "Job submitted", value: selectedJob.createdAt },
                    { label: "Generation started", value: selectedJob.startedAt },
                    { label: selectedJob.status === "succeeded" ? "Resume downloaded" : selectedJob.status === "qa_required" ? "QA review required" : "Generation finished", value: selectedJob.finishedAt },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3">
                      <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{formatQueueTimestamp(item.value)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No queue items yet. Generate a resume to see it land here instantly.
        </div>
      )}
    </div>
  );
}
