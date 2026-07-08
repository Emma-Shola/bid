import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wand2,
  WandSparkles,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { Textarea } from "@/components/ui/textarea";
import { downloadBlob } from "@/lib/download";
import { downloadCsv } from "@/lib/csv";
import { normalizeGeneratedResumePreview } from "@/lib/resume-source";
import { useChannel, type RealtimeEvent } from "@/lib/realtime";
import { ResumeDocumentPreview } from "@/components/resume/ResumeDocumentPreview";
import type { GeneratedResumeStructured } from "@/lib/resume-preview";
import type { BackgroundJob, DuplicateCompanyCheck, ResumeTemplate } from "@/lib/types";
import {
  assignJobToWorkspace,
  bootstrapBidderQueueStore,
  chooseDownloadFolder,
  loadBidderJobsCache,
  loadDownloadFolderName,
  saveBidderQueueStore,
  saveBidderJobsCache,
  saveBlobToSelectedFolder,
  sanitizeResumeFileName,
  setActiveWorkspace,
  setJobNote,
  updateDownloadFolderMeta,
  type BidderQueueStore,
} from "@/lib/bidder-queue-storage";

type QueueFilter = "all" | "queued" | "running" | "succeeded" | "qa_required" | "failed";
type QueueSortMode = "newest" | "oldest" | "fastest" | "slowest";

type QaResultEntry = {
  id: string;
  question: string;
  answer: string;
  keyPoints: string[];
  followUps: string[];
  loading: boolean;
  refining: boolean;
  refineDraft: string;
  error?: string;
};

type QaState = {
  questionsDraft: string;
  results: QaResultEntry[];
};

function makeQaResultId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type QueueViewJob = BackgroundJob & {
  workspaceId: string | null;
  workspaceName: string;
  note: string;
};

type WorkspaceJobStats = {
  total: number;
  queued: number;
  running: number;
  ready: number;
  qa: number;
  failed: number;
  latestAt: string | null;
};

type QueueTone = "muted" | "info" | "success" | "warning" | "destructive";

type CurrentGenerationState = {
  jobId?: string;
  jobTitle: string;
  company: string;
  workspaceId: string | null;
  workspaceName: string;
  folderName: string | null;
  status: string;
  progress: number;
  createdAt: string;
};

type DeliveryState = "saving" | "downloaded" | "failed";

type GenerationMutationContext = {
  optimisticId: string;
  createdAt: string;
  workspaceId: string | null;
  workspaceName: string;
  jobTitle: string;
  company: string;
};

const DEFAULT_QUESTION = "Why do you feel interested in this role?";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

// Mirrors the server's normalizeCompanyName() closely enough to match
// "Acme Corp" against "Acme Corp Inc." for the purpose of dropping a
// just-applied-to company out of the clear-to-apply list client-side.
function normalizeCompanyNameForComparison(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|limited|group|holdings)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getJobTitle(job: BackgroundJob) {
  const payload = asRecord(job.payload);
  return typeof payload.jobTitle === "string" && payload.jobTitle.trim() ? payload.jobTitle : "Untitled role";
}

function getJobCompany(job: BackgroundJob) {
  const payload = asRecord(job.payload);
  return typeof payload.company === "string" && payload.company.trim() ? payload.company : "Unknown company";
}

function getJobUrl(job: BackgroundJob) {
  const payload = asRecord(job.payload);
  return typeof payload.jobUrl === "string" ? payload.jobUrl : "";
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

function getJobPreview(job: BackgroundJob) {
  const result = asRecord(job.result);
  // The persisted BackgroundJob.result for resume.generate jobs stores the
  // rendered text under `resumeMarkdown` (see pipeline.ts/background-worker.ts),
  // not `preview`/`markdown`/`content` — those only ever existed on the
  // synchronous HTTP response shape. Without this fallback every job read
  // back from the queue (polling or realtime) had an empty preview.
  return (
    (typeof result.preview === "string" && result.preview) ||
    (typeof result.resumeMarkdown === "string" && result.resumeMarkdown) ||
    (typeof result.markdown === "string" && result.markdown) ||
    (typeof result.content === "string" && result.content) ||
    (typeof result.coverLetterMarkdown === "string" && result.coverLetterMarkdown) ||
    ""
  );
}

function getJobStructured(job: BackgroundJob): GeneratedResumeStructured | null {
  const result = asRecord(job.result);
  const structured = result.structured;
  if (!structured || typeof structured !== "object") return null;
  return structured as GeneratedResumeStructured;
}

function getUiStatus(job: BackgroundJob): QueueFilter {
  if (job.status === "queued") return "queued";
  if (job.status === "running") return "running";
  if (job.status === "succeeded") return "succeeded";
  if (job.status === "qa_required") return "qa_required";
  return "failed";
}

function getStatusTone(job: BackgroundJob) {
  const status = getUiStatus(job);
  if (status === "queued") return "muted";
  if (status === "running") return "info";
  if (status === "succeeded") return "success";
  if (status === "qa_required") return "warning";
  return "destructive";
}

function getDisplayStatus(job: BackgroundJob, deliveryState: DeliveryState | undefined) {
  const status = getUiStatus(job);
  if (deliveryState === "failed") return "failed";
  if (status === "queued") return "queued";
  if (status === "running" || status === "processing" || status === "retrying") return "generating";
  if (status === "qa_required") return "qa_required";
  if (deliveryState === "downloaded") return "downloaded";
  if (status === "succeeded") return "generated";
  return status;
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

function formatQueueTimestamp(value?: string) {
  if (!value) return "-";
  return format(new Date(value), "MMM d, h:mm a");
}

function buildSearchText(job: QueueViewJob) {
  return [
    job.id,
    job.kind,
    job.status,
    job.workspaceName,
    getJobTitle(job),
    getJobCompany(job),
    getJobDescription(job),
    job.note,
    job.error ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function getFileNameFromJob(job: QueueViewJob) {
  const company = sanitizeResumeFileName(getJobCompany(job));
  return `${company || "resume"}.pdf`;
}

function getDefaultQuestionForJob(job: QueueViewJob) {
  const title = getJobTitle(job);
  return title ? `Why do you feel interested in ${title}?` : DEFAULT_QUESTION;
}

function getGenerationInputFromJob(job: QueueViewJob) {
  const payload = asRecord(job.payload);
  const resumeId =
    typeof payload.resumeId === "string" && payload.resumeId.trim() ? payload.resumeId.trim() : "";
  const jobTitle = typeof payload.jobTitle === "string" && payload.jobTitle.trim() ? payload.jobTitle : getJobTitle(job);
  const company = typeof payload.company === "string" && payload.company.trim() ? payload.company : getJobCompany(job);
  const jobDescription =
    typeof payload.jobDescription === "string" && payload.jobDescription.trim()
      ? payload.jobDescription
      : getJobDescription(job);

  return {
    resumeId: resumeId || undefined,
    jobTitle,
    company,
    jobDescription,
  };
}

function isBrowserFolderSupported() {
  return typeof window !== "undefined" && typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

function getWorkspaceName(store: BidderQueueStore, workspaceId: string | null) {
  return store.workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? "Unsorted";
}

function createEmptyWorkspaceStats(): WorkspaceJobStats {
  return {
    total: 0,
    queued: 0,
    running: 0,
    ready: 0,
    qa: 0,
    failed: 0,
    latestAt: null,
  };
}

function bumpWorkspaceStats(stats: WorkspaceJobStats, job: BackgroundJob) {
  const status = getUiStatus(job);
  stats.total += 1;
  if (status === "queued") stats.queued += 1;
  if (status === "running") stats.running += 1;
  if (status === "succeeded") stats.ready += 1;
  if (status === "qa_required") stats.qa += 1;
  if (status === "failed") stats.failed += 1;

  const timestamp = new Date(job.updatedAt ?? job.finishedAt ?? job.startedAt ?? job.createdAt).toISOString();
  if (!stats.latestAt || timestamp > stats.latestAt) {
    stats.latestAt = timestamp;
  }
}

function getQueueJobView(job: BackgroundJob, store: BidderQueueStore): QueueViewJob {
  const jobWorkspaceId = (job as QueueViewJob).workspaceId ?? null;
  const workspaceId = store.jobWorkspaceMap[job.id] ?? jobWorkspaceId;
  return {
    ...job,
    workspaceId,
    workspaceName: getWorkspaceName(store, workspaceId),
    note: store.jobNotes[job.id] ?? "",
  };
}

export default function ResumeQueueStudio() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const setupState = (location.state ?? {}) as { resumeId?: string; workspaceId?: string };
  const qc = useQueryClient();
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCompanyCheck | null>(null);
  const [jobBoardPaste, setJobBoardPaste] = useState("");
  const [clearCompanies, setClearCompanies] = useState<string[] | null>(null);
  const [companyFilterStats, setCompanyFilterStats] = useState<{ totalExtracted: number; blockedCount: number } | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState(setupState.resumeId ?? "");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(setupState.workspaceId ?? null);
  const [statusFilter, setStatusFilter] = useState<QueueFilter>("all");
  const [sortMode, setSortMode] = useState<QueueSortMode>("newest");
  const [queueSearch, setQueueSearch] = useState("");
  const [queueStore, setQueueStore] = useState<BidderQueueStore>(() => bootstrapBidderQueueStore(user?.id ?? "guest"));
  const [downloadFolderName, setDownloadFolderName] = useState<string | null>(null);
  const [downloadFolderReady, setDownloadFolderReady] = useState(false);
  const [generatedResumeId, setGeneratedResumeId] = useState<string | null>(null);
  const [generatePanelOpen, setGeneratePanelOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [structured, setStructured] = useState<GeneratedResumeStructured | null>(null);
  const [score, setScore] = useState<{
    overall: number;
    keywordCoverage: number;
    skillCoverage: number;
    quantifiedAchievementScore: number;
    bulletQualityScore: number;
    matchedKeywords: string[];
    missingKeywords: string[];
  } | null>(null);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [noteJobId, setNoteJobId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [qaByJobId, setQaByJobId] = useState<Record<string, QaState>>({});
  const [currentGeneration, setCurrentGeneration] = useState<CurrentGenerationState | null>(null);
  const [pendingGenerationRows, setPendingGenerationRows] = useState<QueueViewJob[]>([]);
  const [jobDeliveryStates, setJobDeliveryStates] = useState<Record<string, DeliveryState>>({});
  const autoSaveStateRef = useRef(new Map<string, "saving" | "saved" | "downloaded" | "failed">());
  const structuredCacheRef = useRef(new Map<string, GeneratedResumeStructured>());
  const draftStorageKey = user?.id ? `topbrass:bidder:queue-generator:${user.id}` : null;
  const structuredCacheKey = user?.id ? `topbrass:bidder:job-structured:${user.id}` : null;

  // Load persisted structured cache from localStorage on mount
  useEffect(() => {
    if (!structuredCacheKey) return;
    try {
      const raw = localStorage.getItem(structuredCacheKey);
      if (raw) {
        const parsed: Record<string, GeneratedResumeStructured> = JSON.parse(raw);
        structuredCacheRef.current = new Map(Object.entries(parsed));
      }
    } catch { /* ignore corrupt cache */ }
  }, [structuredCacheKey]);

  function persistStructured(jobId: string, data: GeneratedResumeStructured) {
    structuredCacheRef.current.set(jobId, data);
    if (!structuredCacheKey) return;
    try {
      const entries = [...structuredCacheRef.current.entries()].slice(-50); // keep last 50
      localStorage.setItem(structuredCacheKey, JSON.stringify(Object.fromEntries(entries)));
    } catch { /* ignore quota errors */ }
  }

  function getStructuredForJob(job: BackgroundJob): GeneratedResumeStructured | null {
    return getJobStructured(job) ?? structuredCacheRef.current.get(job.id) ?? null;
  }

  const { data: resumeTemplates = [] } = useQuery({
    queryKey: ["resumes", "bidder"],
    queryFn: () => api.listResumes(),
    enabled: !!user,
  });
  const selectedResumeTemplate = useMemo(
    () => resumeTemplates.find((template) => template.id === selectedResumeId) ?? null,
    [resumeTemplates, selectedResumeId],
  );

  const {
    data: jobs = [],
    isLoading: jobsLoading,
    isFetching: jobsFetching,
    refetch: refetchJobs,
  } = useQuery({
    queryKey: ["bidder-jobs", user?.id],
    queryFn: () => api.listBidderJobs(),
    enabled: !!user,
    initialData: () => (user?.id ? loadBidderJobsCache(user.id) : []),
    refetchOnWindowFocus: true,
    refetchInterval: 10_000,
    retry: false,
  });

  useEffect(() => {
    if (!user?.id) return;
    const store = bootstrapBidderQueueStore(user.id);
    setQueueStore(store);
    // Prefer the workspace passed from the setup page; fall back to the stored active one
    const preselectedWorkspaceId = setupState.workspaceId ?? store.activeWorkspaceId ?? store.workspaces[0]?.id ?? null;
    setSelectedWorkspaceId(preselectedWorkspaceId);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user?.id) return;
    saveBidderQueueStore(user.id, queueStore);
  }, [queueStore, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    saveBidderJobsCache(user.id, jobs);
  }, [jobs, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const folderName = await loadDownloadFolderName(user.id);
        if (cancelled) return;
        setDownloadFolderName(folderName);
        setDownloadFolderReady(!!folderName);
      } catch {
        if (!cancelled) {
          setDownloadFolderName(null);
          setDownloadFolderReady(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!queueStore.activeWorkspaceId && queueStore.workspaces[0]) {
      setQueueStore((current) => setActiveWorkspace(current, queueStore.workspaces[0].id));
      setSelectedWorkspaceId(queueStore.workspaces[0].id);
    }
  }, [queueStore.activeWorkspaceId, queueStore.workspaces]);

  useEffect(() => {
    if (!selectedWorkspaceId && queueStore.workspaces[0]) {
      setSelectedWorkspaceId(queueStore.workspaces[0].id);
    }
  }, [queueStore.workspaces, selectedWorkspaceId]);

  useEffect(() => {
    if (!draftStorageKey) return;
    const saved = window.localStorage.getItem(draftStorageKey);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as {
        jobTitle?: string;
        company?: string;
        jobDescription?: string;
        selectedResumeId?: string;
        output?: string | null;
        generatedResumeId?: string | null;
        status?: string | null;
        jobId?: string | null;
        structured?: GeneratedResumeStructured | null;
        score?: typeof score;
        queueSearch?: string;
      };
      if (typeof parsed.jobTitle === "string") setJobTitle(parsed.jobTitle);
      if (typeof parsed.company === "string") setCompany(parsed.company);
      if (typeof parsed.jobDescription === "string") setJobDescription(parsed.jobDescription);
      if (typeof parsed.selectedResumeId === "string") setSelectedResumeId(parsed.selectedResumeId);
      if (typeof parsed.output !== "undefined") setOutput(parsed.output ?? null);
      if (typeof parsed.generatedResumeId !== "undefined") setGeneratedResumeId(parsed.generatedResumeId ?? null);
      if (typeof parsed.status !== "undefined") setStatus(parsed.status ?? null);
      if (typeof parsed.jobId !== "undefined") setJobId(parsed.jobId ?? null);
      if (typeof parsed.structured !== "undefined") setStructured(parsed.structured ?? null);
      if (typeof parsed.score !== "undefined") setScore(parsed.score ?? null);
      if (typeof parsed.queueSearch === "string") setQueueSearch(parsed.queueSearch);
    } catch {
      // ignore invalid drafts
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftStorageKey) return;
    window.localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        jobTitle,
        company,
        jobDescription,
        selectedResumeId,
        output,
        generatedResumeId,
        status,
        jobId,
        structured,
        score,
        queueSearch,
      }),
    );
  }, [
    company,
    draftStorageKey,
    generatedResumeId,
    jobDescription,
    jobId,
    jobTitle,
    output,
    queueSearch,
    score,
    selectedResumeId,
    status,
    structured,
  ]);

  useEffect(() => {
    if (resumeTemplates.length === 0) {
      if (selectedResumeId) setSelectedResumeId("");
      return;
    }
    // Only fall back to first template if none selected (setup page pre-selects one)
    if (!selectedResumeId || !resumeTemplates.some((resume) => resume.id === selectedResumeId)) {
      setSelectedResumeId(setupState.resumeId && resumeTemplates.some((r) => r.id === setupState.resumeId)
        ? setupState.resumeId
        : resumeTemplates[0].id);
    }
  }, [resumeTemplates, selectedResumeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const queueJobs = useMemo(() => {
    const combined = [...pendingGenerationRows, ...jobs];
    const deduped = new Map<string, QueueViewJob>();
    for (const job of combined) {
      deduped.set(job.id, job as QueueViewJob);
    }
    const visible = Array.from(deduped.values())
      .filter((job) => job.kind === "resume_generate")
      .map((job) => getQueueJobView(job, queueStore))
      .filter((job) => {
        if (queueStore.activeWorkspaceId && job.workspaceId !== queueStore.activeWorkspaceId) return false;
        const status = getUiStatus(job);
        if (statusFilter !== "all" && status !== statusFilter) return false;
        if (queueSearch.trim()) {
          const haystack = buildQueueSearchText(job);
          if (!haystack.includes(queueSearch.trim().toLowerCase())) return false;
        }
        return true;
      });

    return [...visible].sort((left, right) => {
      const leftCreated = new Date(left.createdAt).getTime();
      const rightCreated = new Date(right.createdAt).getTime();
      const leftElapsed = new Date(left.finishedAt ?? left.startedAt ?? left.createdAt).getTime() - leftCreated;
      const rightElapsed = new Date(right.finishedAt ?? right.startedAt ?? right.createdAt).getTime() - rightCreated;

      switch (sortMode) {
        case "oldest":
          return leftCreated - rightCreated;
        case "fastest":
          return leftElapsed - rightElapsed;
        case "slowest":
          return rightElapsed - leftElapsed;
        case "newest":
        default:
          return rightCreated - leftCreated;
      }
    });
  }, [jobs, pendingGenerationRows, queueSearch, queueStore, sortMode, statusFilter]);

  const workspaceStats = useMemo(() => {
    const statsById = new Map<string, WorkspaceJobStats>();

    for (const job of [...pendingGenerationRows, ...jobs]) {
      if (job.kind !== "resume_generate") continue;
      const workspaceId = queueStore.jobWorkspaceMap[job.id];
      const resolvedWorkspaceId = workspaceId ?? (job as QueueViewJob).workspaceId ?? null;
      if (!resolvedWorkspaceId) continue;

      const current = statsById.get(resolvedWorkspaceId) ?? createEmptyWorkspaceStats();
      bumpWorkspaceStats(current, job);
      statsById.set(resolvedWorkspaceId, current);
    }

    return statsById;
  }, [jobs, pendingGenerationRows, queueStore.jobWorkspaceMap]);

  const selectedPreviewJob = queueJobs.find((job) => job.id === previewJobId) ?? null;
  const selectedNoteJob = queueJobs.find((job) => job.id === noteJobId) ?? null;
  const activeWorkspace = queueStore.workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? queueStore.workspaces[0] ?? null;
  const activeWorkspaceStats = activeWorkspace ? workspaceStats.get(activeWorkspace.id) ?? createEmptyWorkspaceStats() : createEmptyWorkspaceStats();
  const queueIsSyncing = jobsLoading && queueJobs.length === 0 && pendingGenerationRows.length === 0;

  useEffect(() => {
    if (previewJobId && !queueJobs.some((job) => job.id === previewJobId)) {
      setPreviewJobId(null);
    }
    if (noteJobId && !queueJobs.some((job) => job.id === noteJobId)) {
      setNoteJobId(null);
    }
  }, [noteJobId, previewJobId, queueJobs]);

  useEffect(() => {
    if (!noteJobId) {
      setNoteDraft("");
      return;
    }
    setNoteDraft(queueStore.jobNotes[noteJobId] ?? "");
  }, [noteJobId, queueStore.jobNotes]);

  const queueStats = {
    queued: queueJobs.filter((job) => getUiStatus(job) === "queued").length,
    generating: queueJobs.filter((job) => getUiStatus(job) === "running").length,
    ready: queueJobs.filter((job) => getUiStatus(job) === "succeeded").length,
    qa: queueJobs.filter((job) => getUiStatus(job) === "qa_required").length,
    failed: queueJobs.filter((job) => getUiStatus(job) === "failed").length,
  };

  const gen = useMutation({
    mutationFn: async (
      variables?: {
        resumeId?: string;
        jobTitle?: string;
        company?: string;
        jobDescription?: string;
        jobUrl?: string;
        workspaceId?: string | null;
      },
    ) => {
      const resumeId = variables?.resumeId ?? selectedResumeId;
      const jobTitleValue = variables?.jobTitle ?? jobTitle;
      const companyValue = variables?.company ?? company;
      const jobDescriptionValue = variables?.jobDescription ?? jobDescription;
      const jobUrlValue = variables?.jobUrl ?? jobUrl;

      const resumeTemplate = resumeTemplates.find((template) => template.id === resumeId);
      if (!resumeTemplate) {
        throw new Error("Pick a resume template before generating.");
      }
      return api.generateResume({
        resumeId,
        jobTitle: jobTitleValue,
        company: companyValue,
        jobUrl: jobUrlValue.trim() || undefined,
        jobDescription: jobDescriptionValue,
        preferInline: false,
      });
    },
    onMutate: (variables) => {
      const workspaceId = variables?.workspaceId ?? activeWorkspace?.id ?? null;
      const workspaceName =
        queueStore.workspaces.find((workspace) => workspace.id === workspaceId)?.name ??
        activeWorkspace?.name ??
        "Unsorted";
      const jobTitleValue = variables?.jobTitle ?? jobTitle;
      const companyValue = variables?.company ?? company;
      const jobDescriptionValue = variables?.jobDescription ?? jobDescription;
      const resumeIdValue = variables?.resumeId ?? selectedResumeId;
      const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const createdAt = new Date().toISOString();
      setCurrentGeneration({
        jobId: undefined,
        jobTitle: jobTitleValue.trim(),
        company: companyValue.trim(),
        workspaceId,
        workspaceName,
        folderName: downloadFolderName,
        status: "running",
        progress: 18,
        createdAt,
      });
      setPendingGenerationRows((current) => [
        {
          id: optimisticId,
          kind: "resume_generate",
          status: "running",
          attempts: 0,
          maxAttempts: 1,
          progress: 18,
          createdAt,
          updatedAt: createdAt,
          startedAt: createdAt,
          payload: {
            jobTitle: jobTitleValue.trim(),
            company: companyValue.trim(),
            jobDescription: jobDescriptionValue.trim(),
            resumeId: resumeIdValue,
          },
          workspaceId,
          workspaceName,
          note: "",
        } as QueueViewJob,
        ...current.filter((job) => job.id !== optimisticId),
      ]);
      return {
        optimisticId,
        createdAt,
        workspaceId,
        workspaceName,
        jobTitle: jobTitleValue.trim(),
        company: companyValue.trim(),
      };
    },
    onSuccess: async (result, variables, context) => {
      const optimisticId = context?.optimisticId;
      const createdAt = context?.createdAt ?? new Date().toISOString();
      const targetWorkspaceId = context?.workspaceId ?? variables?.workspaceId ?? activeWorkspace?.id ?? null;
      const workspaceName = context?.workspaceName ?? activeWorkspace?.name ?? "Unsorted";
      const jobTitleValue = context?.jobTitle ?? variables?.jobTitle ?? jobTitle;
      const companyValue = context?.company ?? variables?.company ?? company;
      setJobId(result.jobId);
      setStatus(result.status);
      setGeneratedResumeId(result.generatedResumeId ?? null);
      setStructured(result.structured ?? null);
      setScore(result.score ?? null);
      setOutput(
        result.preview
          ? normalizeGeneratedResumePreview(result.preview, "")
          : result.message ?? "Your resume job has been queued. We will update the queue as soon as it is ready.",
      );

      if (result.jobId && targetWorkspaceId) {
        setQueueStore((current) => assignJobToWorkspace(current, result.jobId, targetWorkspaceId));
      }

      void qc.invalidateQueries({ queryKey: ["bidder-jobs", user?.id] });

      if (result.jobId) {
        setPendingGenerationRows((current) =>
          current.map((job) =>
            optimisticId && job.id !== optimisticId
              ? job
              : {
                  ...job,
                  id: result.jobId ?? job.id,
                  status:
                    result.status === "completed"
                      ? "succeeded"
                      : result.status === "qa_required"
                        ? "qa_required"
                        : "running",
                  progress:
                    result.status === "queued"
                      ? Math.max(job.progress, 55)
                      : result.status === "completed" || result.status === "qa_required"
                        ? 100
                        : Math.max(job.progress, 65),
                  updatedAt: createdAt,
                  startedAt: job.startedAt ?? createdAt,
                  finishedAt:
                    result.status === "completed" || result.status === "qa_required"
                      ? createdAt
                      : undefined,
                  result: {
                    ...(job.result ?? {}),
                    ...(result.preview ? { preview: normalizeGeneratedResumePreview(result.preview, "") } : {}),
                    ...(result.structured ? { structured: result.structured } : {}),
                    ...(result.score ? { score: result.score } : {}),
                    ...(result.generatedResumeId ? { meta: { generatedResumeId: result.generatedResumeId } } : {}),
                  },
                  workspaceId: targetWorkspaceId,
                  workspaceName,
                } as QueueViewJob,
          ),
        );

        setCurrentGeneration((current) => ({
          jobId: result.jobId,
          jobTitle: current?.jobTitle ?? jobTitleValue,
          company: current?.company ?? companyValue,
          workspaceId: current?.workspaceId ?? targetWorkspaceId,
          workspaceName: current?.workspaceName ?? workspaceName,
          folderName: downloadFolderName,
          status: result.status === "queued" ? "running" : result.status,
          progress: result.status === "queued" ? 55 : result.status === "completed" || result.status === "qa_required" ? 100 : 65,
          createdAt: current?.createdAt ?? createdAt,
        }));
      }

      toast.success(
        result.status === "completed"
          ? "Resume generated"
          : result.status === "qa_required"
            ? "Resume generated and marked for QA"
            : "Resume generation queued",
      );

      if (result.status === "completed" || result.status === "qa_required") {
        await autoSaveGeneratedResume(result.jobId, result.status, {
          structured: result.structured,
          jobTitle: jobTitleValue,
          company: companyValue,
        });
      }
    },
    onError: (error, _variables, context) => {
      setStatus("failed");
      if (context?.optimisticId) {
        setPendingGenerationRows((current) =>
          current.map((job) =>
            job.id === context.optimisticId
              ? {
                  ...job,
                  status: "failed",
                  progress: 100,
                  finishedAt: new Date().toISOString(),
                  result: {
                    ...(job.result ?? {}),
                    error: (error as Error).message || "Failed to generate resume",
                  },
                }
              : job,
          ),
        );
      }
      setCurrentGeneration((current) => (current ? { ...current, status: "failed", progress: 100 } : current));
      toast.error((error as Error).message || "Failed to generate resume");
    },
  });

  async function autoSaveGeneratedResume(
    targetJobId: string | undefined,
    statusLabel: string,
    content: { structured?: unknown; jobTitle?: string; company?: string } = {},
  ) {
    const log = (message: string) => console.log(`[resume-download] autoSave job=${targetJobId ?? "?"} ${message}`);

    if (!user?.id) {
      log("aborted: no authenticated user");
      return;
    }
    const dedupeKey = targetJobId ?? `no-job-${Date.now()}`;
    const state = autoSaveStateRef.current.get(dedupeKey);
    if (state === "saving" || state === "saved" || state === "downloaded") {
      log(`skipped: dedupe state is already "${state}"`);
      return;
    }
    log(`starting (previous state: ${state ?? "none"})`);
    autoSaveStateRef.current.set(dedupeKey, "saving");
    setJobDeliveryStates((current) => {
      const next = { ...current };
      next[dedupeKey] = "saving";
      return next;
    });

    try {
      const fallbackJob = queueJobs.find((job) => job.id === targetJobId);
      const jobResumeId = fallbackJob ? getGenerationInputFromJob(fallbackJob).resumeId : selectedResumeId;
      const managerRules = resumeTemplates.find((template) => template.id === jobResumeId)?.generationRules;
      const jobCompany = content.company ?? company;
      const subfolderName = managerRules?.groupDownloadsByCompanyFolder && jobCompany ? jobCompany : undefined;

      const hasStructured =
        content.structured && typeof content.structured === "object" &&
        "source" in (content.structured as object) && "tailored" in (content.structured as object);

      let blob: Blob;
      let fileName: string;

      if (hasStructured) {
        log("requesting PDF from stateless export endpoint");
        const structured = content.structured as GeneratedResumeStructured;
        if (targetJobId) persistStructured(targetJobId, structured);
        ({ blob, fileName } = await api.exportResumeToBlob({
          structured,
          jobTitle: content.jobTitle ?? jobTitle,
          company: jobCompany,
          format: "pdf",
          resumeId: jobResumeId,
        }));
      } else {
        // The realtime-delivered content was missed (refresh, dropped
        // websocket event, etc). Fall back to the server-persisted copy
        // instead of failing outright — same endpoint the single-application
        // page already relies on.
        const generatedResumeId = fallbackJob ? getGeneratedResumeId(fallbackJob) : "";
        if (!generatedResumeId) {
          throw new Error("Resume content not available — please regenerate this resume.");
        }
        log("stateless content missing, falling back to persisted export endpoint");
        ({ blob, fileName } = await api.fetchGeneratedResumeBlob(generatedResumeId, "pdf"));
      }

      log(`export fetched ok, size=${blob.size} bytes fileName="${fileName}"`);
      const fallbackName = sanitizeResumeFileName(
        fileName || (fallbackJob ? getFileNameFromJob(fallbackJob) : `resume_${targetJobId ?? "generated"}.pdf`),
      );

      const saveResult = await saveBlobToSelectedFolder(user.id, fallbackName, blob, subfolderName);
      if (saveResult.saved) {
        log(`saved to folder "${saveResult.folderName}" as "${saveResult.fileName}"`);
        autoSaveStateRef.current.set(dedupeKey, "saved");
        setJobDeliveryStates((current) => {
          const next = { ...current };
          next[dedupeKey] = "downloaded";
          return next;
        });
        toast.success(
          statusLabel === "qa_required"
            ? `Resume saved to ${saveResult.folderName ?? "your selected folder"} and marked for QA`
            : `Resume saved to ${saveResult.folderName ?? "your selected folder"}`,
        );
        setCurrentGeneration((current) =>
          current
            ? {
                ...current,
                status: "downloaded",
                progress: 100,
                folderName: saveResult.folderName ?? current.folderName,
              }
            : current,
        );
        return;
      }

      log(`folder save skipped/failed (${saveResult.reason}); falling back to browser download`);
      downloadBlob(blob, fallbackName);
      autoSaveStateRef.current.set(dedupeKey, "downloaded");
      setJobDeliveryStates((current) => {
        const next = { ...current };
        next[dedupeKey] = "downloaded";
        return next;
      });
      toast.warning(
        saveResult.reason === "No download folder selected."
          ? "No download folder selected, so the file was downloaded in the browser instead."
          : `Auto-save to your folder failed (${saveResult.reason}), so the file was downloaded in the browser instead.`,
      );
    } catch (error) {
      log(`failed: ${(error as Error).message ?? error}`);
      console.error("[resume-download] autoSaveGeneratedResume threw", error);
      autoSaveStateRef.current.set(dedupeKey, "failed");
      setJobDeliveryStates((current) => {
        const next = { ...current };
        next[dedupeKey] = "failed";
        return next;
      });
      toast.error((error as Error).message || "Failed to save the generated resume");
    }
  }

  useChannel<
    RealtimeEvent<{
      job: {
        id: string;
        status: string;
        result?: {
          preview?: string;
          markdown?: string;
          content?: string;
          structured?: GeneratedResumeStructured;
          meta?: { generatedResumeId?: string };
          score?: {
            overall: number;
            keywordCoverage: number;
            skillCoverage: number;
            quantifiedAchievementScore: number;
            bulletQualityScore: number;
            matchedKeywords: string[];
            missingKeywords: string[];
          };
        };
        error?: string;
      };
      // resume content pushed here only — never stored in the DB
      content?: {
        resumeMarkdown?: string;
        coverLetterMarkdown?: string;
        structured?: GeneratedResumeStructured;
        score?: {
          overall: number;
          keywordCoverage: number;
          skillCoverage: number;
          quantifiedAchievementScore: number;
          bulletQualityScore: number;
          matchedKeywords: string[];
          missingKeywords: string[];
        };
        preview?: string;
      };
    }>
  >("background-job.updated", (event) => {
    if (!isLiveResumeQueueEvent(event) || !event.data.job.id) return;
    qc.invalidateQueries({ queryKey: ["bidder-jobs", user?.id] });

    // Content is delivered via event.data.content (never stored server-side)
    const deliveredContent = event.data.content;

    setPendingGenerationRows((current) =>
      current.map((job) => {
        if (job.id !== event.data.job.id) return job;

        const nextResult = {
          ...(job.result ?? {}),
        } as Record<string, unknown>;
        const src = deliveredContent ?? event.data.job.result;
        if (typeof src?.preview === "string") {
          nextResult.preview = normalizeGeneratedResumePreview(src.preview, "");
        }
        if (src?.structured) {
          nextResult.structured = src.structured;
        }
        if (src?.score) {
          nextResult.score = src.score;
        }

        if (event.data.job.status === "running" || event.data.job.status === "processing" || event.data.job.status === "retrying") {
          return {
            ...job,
            status: "running",
            progress: Math.max(job.progress, 45),
            updatedAt: new Date().toISOString(),
            result: nextResult,
          };
        }

        if (event.data.job.status === "completed" || event.data.job.status === "qa_required") {
          return {
            ...job,
            status: event.data.job.status === "completed" ? "succeeded" : "qa_required",
            progress: 100,
            updatedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            result: nextResult,
          };
        }

        if (event.data.job.status === "failed" || event.data.job.status === "dead_letter") {
          return {
            ...job,
            status: "failed",
            progress: 100,
            updatedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            error: event.data.job.error,
            result: nextResult,
          };
        }

        return {
          ...job,
          updatedAt: new Date().toISOString(),
          result: nextResult,
        };
      }),
    );

    if (jobId && event.data.job.id === jobId) {
      setStatus(event.data.job.status);
      if (event.data.job.status === "running" || event.data.job.status === "processing" || event.data.job.status === "retrying") {
        setCurrentGeneration((current) =>
          current
            ? {
                ...current,
                status: "running",
                progress: Math.max(current.progress, 40),
              }
            : current,
        );
      }
      if (event.data.job.status === "completed" || event.data.job.status === "qa_required") {
        const wsContent = deliveredContent ?? event.data.job.result;
        setStructured(wsContent?.structured ?? structured);
        setScore(wsContent?.score ?? score);
        const preview = normalizeGeneratedResumePreview(
          typeof wsContent?.preview === "string" ? wsContent.preview : "",
          "",
        );
        if (preview) setOutput(preview);

        // The live jobTitle/company form fields may have already been cleared
        // (or repopulated for a different job) by the time this event arrives,
        // especially for slower queued generations — so source the title and
        // company from the job's own payload instead of current form state.
        const sourceJob = [...pendingGenerationRows, ...jobs].find((job) => job.id === event.data.job.id);
        const eventJobTitle = sourceJob ? getJobTitle(sourceJob) : jobTitle;
        const eventJobCompany = sourceJob ? getJobCompany(sourceJob) : company;

        const nextGenerationState: CurrentGenerationState = {
          jobId: event.data.job.id,
          jobTitle: eventJobTitle,
          company: eventJobCompany,
          workspaceId: activeWorkspace?.id ?? null,
          workspaceName: activeWorkspace?.name ?? "Unsorted",
          folderName: downloadFolderName,
          status: event.data.job.status,
          progress: 100,
          createdAt: currentGeneration?.createdAt ?? new Date().toISOString(),
        };
        setCurrentGeneration(nextGenerationState);

        if (wsContent?.structured) {
          persistStructured(event.data.job.id, wsContent.structured as GeneratedResumeStructured);
        }
        void autoSaveGeneratedResume(event.data.job.id, event.data.job.status, {
          structured: wsContent?.structured,
          jobTitle: eventJobTitle,
          company: eventJobCompany,
        });
      }
      if (event.data.job.status === "failed" || event.data.job.status === "dead_letter") {
        setOutput(event.data.job.error ?? "Resume generation failed.");
        setCurrentGeneration((current) =>
          current ? { ...current, status: event.data.job.status, progress: 100 } : current,
        );
      }
    }
  });

  useEffect(() => {
    if (!output && status === "queued") {
      setOutput("Resume generation is in progress. The queue below will update automatically when the job completes.");
    }
  }, [output, status]);

  useEffect(() => {
    if (selectedWorkspaceId && selectedWorkspaceId !== queueStore.activeWorkspaceId) {
      setQueueStore((current) => setActiveWorkspace(current, selectedWorkspaceId));
    }
  }, [queueStore.activeWorkspaceId, selectedWorkspaceId]);

  async function handleChooseFolder() {
    if (!user?.id) return;
    try {
      const handle = await chooseDownloadFolder(user.id);
      setDownloadFolderName(handle.name || "Selected folder");
      setDownloadFolderReady(true);
      setQueueStore((current) => updateDownloadFolderMeta(current, handle.name || "Selected folder"));
      toast.success(`Download folder set to ${handle.name || "Selected folder"}`);
    } catch (error) {
      toast.error((error as Error).message || "Could not select a folder");
    }
  }

  function handleExportApplications() {
    if (jobs.length === 0) {
      toast.error("No applications to export yet.");
      return;
    }

    downloadCsv(
      `applications-${format(new Date(), "yyyy-MM-dd")}.csv`,
      [
        ["Company", "Job title", "Link"],
        ...jobs.map((job) => [getJobCompany(job), getJobTitle(job), getJobUrl(job)]),
      ],
    );
  }

  const filterCompanies = useMutation({
    mutationFn: () => api.filterCompaniesFromText(jobBoardPaste),
    onSuccess: (result) => {
      setClearCompanies(result.clearCompanies);
      setCompanyFilterStats({ totalExtracted: result.totalExtracted, blockedCount: result.blockedCount });
      if (result.totalExtracted === 0) {
        toast.warning("Couldn't find any company names in that text.");
      } else {
        toast.success(`${result.clearCompanies.length} of ${result.totalExtracted} companies are clear to apply to`);
      }
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to check companies");
    },
  });

  const recheckCompany = useMutation({
    mutationFn: () => api.checkDuplicateCompany(company),
    onSuccess: (result) => setDuplicateCheck(result),
    onError: (error) => {
      toast.error((error as Error).message || "Failed to check company");
    },
  });

  const fetchFromUrl = useMutation({
    mutationFn: () => api.fetchJobFromUrl(jobUrl),
    onSuccess: (result) => {
      if (result.jobTitle) setJobTitle(result.jobTitle);
      if (result.company) setCompany(result.company);
      if (result.jobDescription) setJobDescription(result.jobDescription);
      setDuplicateCheck(null);

      if (!result.jobTitle && !result.company) {
        toast.warning(
          result.jobDescription
            ? "Filled in the description, but couldn't confidently identify the job title or company — check and fill those in manually."
            : "Couldn't read this page well enough to fill anything in. Paste the text above instead.",
        );
      } else if (!result.jobTitle || !result.company) {
        toast.warning(`Filled in what we could find — double-check the ${result.jobTitle ? "company" : "job title"} field.`);
      } else {
        toast.success("Job details filled in from the URL");
      }
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to fetch job details from that URL");
    },
  });

  function handleGenerate() {
    const missing: string[] = [];
    if (!jobTitle.trim()) missing.push("job title");
    if (!company.trim()) missing.push("company");
    if (!jobDescription.trim()) missing.push("job description");
    if (!selectedResumeId) missing.push("resume template");

    if (missing.length > 0) {
      toast.error(`Add ${missing.join(", ")} before generating.`);
      return false;
    }

    if (!downloadFolderReady) {
      toast.error("Choose a download folder first so the generated file can be saved automatically.");
      return false;
    }

    if (selectedResumeTemplate?.isUsableForGeneration === false) {
      toast.warning(
        "This template is marked as prompt-like, but the server will still try to extract usable resume data before generating.",
      );
    }

    if (!activeWorkspace) {
      toast.error("Create today's workspace folder first.");
      navigate("/bidder/workspaces");
      return false;
    }

    gen.mutate({
      resumeId: selectedResumeId,
      jobTitle,
      company,
      jobDescription,
      jobUrl,
      workspaceId: activeWorkspace?.id ?? null,
    });

    const appliedCompanyKey = normalizeCompanyNameForComparison(company);
    setClearCompanies((current) =>
      current ? current.filter((name) => normalizeCompanyNameForComparison(name) !== appliedCompanyKey) : current,
    );

    setJobTitle("");
    setCompany("");
    setJobUrl("");
    setJobDescription("");
    setDuplicateCheck(null);
    return true;
  }

  function openPreview(job: QueueViewJob) {
    setPreviewJobId(job.id);
  }

  function openNoteEditor(job: QueueViewJob) {
    setNoteJobId(job.id);
    setExpandedJobId(job.id);
  }

  async function saveJobNote() {
    if (!noteJobId) return;
    setQueueStore((current) => setJobNote(current, noteJobId, noteDraft));
    toast.success("Job note saved");
    setNoteJobId(null);
  }

  async function manualDownload(job: QueueViewJob, format: "pdf" | "docx" = "pdf") {
    const structured = getStructuredForJob(job);
    const generatedResumeId = getGeneratedResumeId(job);

    try {
      if (structured) {
        const { blob, fileName } = await api.exportResumeToBlob({
          structured,
          jobTitle: getJobTitle(job),
          company: getJobCompany(job),
          format,
          resumeId: getGenerationInputFromJob(job).resumeId,
        });
        downloadBlob(blob, sanitizeResumeFileName(fileName));
        toast.success(`${format.toUpperCase()} download started`);
        return;
      }

      if (generatedResumeId) {
        // Local cache missed the realtime-delivered content (refresh, missed
        // websocket event, etc). Fall back to the server-persisted copy.
        const { blob, fileName } = await api.fetchGeneratedResumeBlob(generatedResumeId, format);
        downloadBlob(blob, sanitizeResumeFileName(fileName));
        toast.success(`${format.toUpperCase()} download started`);
        return;
      }

      toast.error("Resume data not available — please regenerate this resume to download it again.");
    } catch (error) {
      toast.error((error as Error).message || "Failed to export the resume");
    }
  }

  async function deleteQueueJob(job: QueueViewJob) {
    const confirmed = window.confirm(
      `Delete the resume for ${getJobTitle(job)} at ${getJobCompany(job)}? This can't be undone, and it will also clear it from the 30-day duplicate-company check.`,
    );
    if (!confirmed) return;

    try {
      await api.deleteJob(job.id);
      setPendingGenerationRows((current) => current.filter((row) => row.id !== job.id));
      void qc.invalidateQueries({ queryKey: ["bidder-jobs", user?.id] });
      toast.success("Resume deleted");
    } catch (error) {
      toast.error((error as Error).message || "Failed to delete resume");
    }
  }

  async function retryQueueJob(job: QueueViewJob) {
    const retryInput = getGenerationInputFromJob(job);
    if (!retryInput.jobTitle.trim() || !retryInput.company.trim() || !retryInput.jobDescription.trim()) {
      toast.error("This job does not have enough source data to retry.");
      return;
    }

    if (!downloadFolderReady) {
      toast.error("Choose a download folder first before retrying.");
      return;
    }

    if (!activeWorkspace) {
      toast.error("Create today's workspace folder first.");
      navigate("/bidder/workspaces");
      return;
    }

    if (retryInput.resumeId) {
      setSelectedResumeId(retryInput.resumeId);
    }
    setJobTitle(retryInput.jobTitle);
    setCompany(retryInput.company);
    setJobDescription(retryInput.jobDescription);
    gen.mutate({
      ...retryInput,
      workspaceId: activeWorkspace.id,
    });

    const retriedCompanyKey = normalizeCompanyNameForComparison(retryInput.company);
    setClearCompanies((current) =>
      current ? current.filter((name) => normalizeCompanyNameForComparison(name) !== retriedCompanyKey) : current,
    );
  }

  const renderQueueJob = (job: QueueViewJob, index: number) => {
    const payload = asRecord(job.payload);
    const status = getUiStatus(job);
    const progress = getProgressValue(job);
    const generatedResumeId = getGeneratedResumeId(job);
    const preview = getJobPreview(job);
    const structuredResult = getJobStructured(job);
    const expanded = expandedJobId === job.id;
    const rowNumber = queueJobs.length - index;
    const deliveryState = jobDeliveryStates[job.id];
    const displayStatus = getDisplayStatus(job, deliveryState);
    const templateId = typeof payload.resumeId === "string" ? payload.resumeId : "";
    const templateTitle =
      resumeTemplates.find((template) => template.id === templateId)?.title ??
      (templateId ? "Linked template" : "No template link");
    const qaState = qaByJobId[job.id] ?? {
      questionsDraft: getDefaultQuestionForJob(job),
      results: [],
    };

    function updateJobResults(updater: (results: QaResultEntry[]) => QaResultEntry[]) {
      setQaByJobId((current) => {
        const state = current[job.id] ?? qaState;
        return { ...current, [job.id]: { ...state, results: updater(state.results) } };
      });
    }

    function handleAskAllForJob() {
      const questions = Array.from(
        new Set(qaState.questionsDraft.split("\n").map((line) => line.trim()).filter(Boolean)),
      ).slice(0, 10);
      if (questions.length === 0) return;

      const pending: QaResultEntry[] = questions.map((question) => ({
        id: makeQaResultId(),
        question,
        answer: "",
        keyPoints: [],
        followUps: [],
        loading: true,
        refining: false,
        refineDraft: "",
      }));

      setQaByJobId((current) => ({
        ...current,
        [job.id]: { questionsDraft: "", results: [...pending, ...qaState.results] },
      }));

      pending.forEach((entry) => {
        api
          .askInterviewQuestion({
            question: entry.question,
            jobTitle: getJobTitle(job),
            company: getJobCompany(job),
            jobDescription: getJobDescription(job),
            structured: structuredResult
              ? (structuredResult as unknown as { source: Record<string, unknown>; tailored: Record<string, unknown> })
              : undefined,
          })
          .then((result) => {
            updateJobResults((results) =>
              results.map((item) =>
                item.id === entry.id
                  ? { ...item, answer: result.answer, keyPoints: result.keyPoints ?? [], followUps: result.followUpQuestions ?? [], loading: false }
                  : item,
              ),
            );
          })
          .catch((error) => {
            updateJobResults((results) =>
              results.map((item) =>
                item.id === entry.id ? { ...item, loading: false, error: (error as Error).message || "Failed to generate an interview answer" } : item,
              ),
            );
          });
      });
    }

    function refineAnswer(entryId: string, instruction: string) {
      const entry = qaState.results.find((item) => item.id === entryId);
      if (!entry || !instruction.trim() || !entry.answer.trim()) return;

      updateJobResults((results) => results.map((item) => (item.id === entryId ? { ...item, refining: true } : item)));

      api
        .askInterviewQuestion({
          question: entry.question,
          refineInstruction: instruction.trim(),
          previousAnswer: entry.answer,
          jobTitle: getJobTitle(job),
          company: getJobCompany(job),
          jobDescription: getJobDescription(job),
          structured: structuredResult
            ? (structuredResult as unknown as { source: Record<string, unknown>; tailored: Record<string, unknown> })
            : undefined,
        })
        .then((result) => {
          updateJobResults((results) =>
            results.map((item) =>
              item.id === entryId
                ? { ...item, answer: result.answer, keyPoints: result.keyPoints ?? [], followUps: result.followUpQuestions ?? [], refining: false, refineDraft: "" }
                : item,
            ),
          );
        })
        .catch((error) => {
          updateJobResults((results) => results.map((item) => (item.id === entryId ? { ...item, refining: false } : item)));
          toast.error((error as Error).message || "Failed to refine the answer");
        });
    }

    return (
      <Collapsible key={job.id} open={expanded} onOpenChange={(open) => setExpandedJobId(open ? job.id : null)}>
        <div className={["w-full border-b border-border/70 bg-white", expanded ? "bg-[#eaf2ff]" : ""].join(" ")}>
          <div className={["grid grid-cols-[28px_minmax(0,1.1fr)_88px_84px_56px_56px_66px_96px] items-center gap-1.5 px-4 py-3", expanded ? "bg-[#eaf2ff]" : "bg-white"].join(" ")}>
            <div className="text-[11px] font-semibold tabular-nums text-slate-500">{rowNumber}</div>

            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="truncate text-[13px] font-semibold text-slate-900">{getJobTitle(job)}</h3>
              </div>
              <p className="truncate text-[11px] text-slate-500">{getJobCompany(job)}</p>
            </div>

            <div className="text-[11px] text-slate-600">
              <div>{format(new Date(job.createdAt), "MMM d, yyyy")}</div>
              <div className="mt-0.5 text-[11px] text-slate-400">{format(new Date(job.createdAt), "h:mm a")}</div>
            </div>

            <div className="flex items-center">
              <StatusBadge value={displayStatus} />
            </div>

            <div className="text-[11px] tabular-nums text-slate-600">{formatQueueDuration(job)}</div>

            <div className="flex items-start">
              <Button size="sm" variant="outline" className="h-7 rounded-md border-[#cfdcff] bg-[#edf4ff] px-2 text-[11px] text-blue-600 hover:bg-[#e4efff]" onClick={() => openPreview(job)}>
                View
              </Button>
            </div>

            <div className="flex items-start">
              <Button size="sm" variant="outline" className="h-7 rounded-md border-dashed border-[#d8dfee] bg-transparent px-2 text-[11px] text-slate-400 hover:border-[#9bb7ff] hover:text-slate-600" onClick={() => openNoteEditor(job)}>
                Add note
              </Button>
            </div>

            <div className="flex items-center gap-1 xl:justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="outline" className="h-8 w-8 rounded-md" disabled={!getStructuredForJob(job) && !generatedResumeId}>
                    <Download className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={!getStructuredForJob(job) && !generatedResumeId} onClick={() => void manualDownload(job, "pdf")}>
                    Download PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!getStructuredForJob(job) && !generatedResumeId} onClick={() => void manualDownload(job, "docx")}>
                    Download DOCX
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 rounded-md"
                onClick={() => {
                  if (status === "failed" || status === "dead_letter") {
                    void retryQueueJob(job);
                    return;
                  }
                  void refetchJobs();
                }}
              >
                <RefreshCw className="h-3 w-3 text-violet-500" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 rounded-md hover:border-destructive/50 hover:text-destructive"
                onClick={() => void deleteQueueJob(job)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="outline" className="h-8 w-8 rounded-md" onClick={() => setExpandedJobId(expanded ? null : job.id)}>
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          <CollapsibleContent className="space-y-3 px-4 pb-4">
            <Separator className="bg-border/70" />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_0.95fr]">
              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Job brief</p>
                    <p className="text-xs text-muted-foreground">Source description used to tailor the resume and answer interview prompts.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-full"
                    onClick={async () => {
                      const text = getJobDescription(job);
                      if (!text.trim()) return;
                      await navigator.clipboard.writeText(text);
                      toast.success("Job description copied");
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy JD
                  </Button>
                </div>

                <ScrollArea className="h-[230px] rounded-xl border border-border/60 bg-background">
                  <Textarea
                    value={getJobDescription(job)}
                    readOnly
                    className="min-h-[230px] resize-none border-0 bg-transparent p-3.5 font-mono text-[11px] leading-5 shadow-none focus-visible:ring-0"
                  />
                </ScrollArea>

                {job.note ? (
                  <div className="rounded-xl border border-border/70 bg-background p-3.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Saved note</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{job.note}</p>
                  </div>
                ) : null}

                {status === "failed" ? (
                  <div className="rounded-xl border border-[hsl(var(--destructive)/0.25)] bg-[hsl(var(--destructive)/0.06)] p-3.5 text-sm text-[hsl(var(--destructive))]">
                    <div className="flex items-center gap-2 font-medium">
                      <TriangleAlert className="h-4 w-4" />
                      Generation failed
                    </div>
                    <p className="mt-2 text-sm text-foreground/80">
                      Refresh the queue, inspect the error, and try generating again once the inputs are ready.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ask AI</p>
                    <p className="text-xs text-muted-foreground">Use the job description to get a focused interview answer.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-full"
                    onClick={() =>
                      navigate(
                        `/bidder/interview?${new URLSearchParams({
                          jobTitle: getJobTitle(job),
                          company: getJobCompany(job),
                          jobDescription: getJobDescription(job),
                        }).toString()}`,
                      )
                    }
                  >
                    <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
                    Open coach
                  </Button>
                </div>

                <Textarea
                  value={qaState.questionsDraft}
                  onChange={(event) =>
                    setQaByJobId((current) => ({
                      ...current,
                      [job.id]: { ...qaState, questionsDraft: event.target.value },
                    }))
                  }
                  placeholder={"One question per line for multiple, e.g.:\nWhy do you want this role?\nTell me about a major challenge you solved."}
                  className="min-h-[92px] resize-none rounded-xl bg-background"
                />

                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Why do you want this role?",
                    "Tell me about a major challenge you solved.",
                    "How do you handle ambiguity?",
                    "Explain your leadership style.",
                  ].map((prompt) => (
                    <Button
                      key={prompt}
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full text-xs"
                      onClick={() =>
                        setQaByJobId((current) => {
                          const lines = qaState.questionsDraft.split("\n").map((line) => line.trim()).filter(Boolean);
                          const nextDraft = lines.includes(prompt) ? qaState.questionsDraft : [...lines, prompt].join("\n");
                          return { ...current, [job.id]: { ...qaState, questionsDraft: nextDraft } };
                        })
                      }
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>

                <Button
                  className="h-9 w-full rounded-full"
                  disabled={!qaState.questionsDraft.trim()}
                  onClick={handleAskAllForJob}
                >
                  <WandSparkles className="mr-1.5 h-4 w-4" />
                  Ask AI
                </Button>

                {qaState.results.length > 0 && (
                  <div className="space-y-3">
                    {qaState.results.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-border/70 bg-background p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-foreground">{entry.question}</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                            disabled={!entry.answer.trim()}
                            onClick={() => {
                              navigator.clipboard.writeText(entry.answer).then(() => toast.success("Answer copied")).catch(() => toast.error("Could not copy"));
                            }}
                          >
                            <Copy className="h-3 w-3" />
                            Copy
                          </Button>
                        </div>

                        {entry.loading ? (
                          <p className="mt-2 text-sm text-muted-foreground">Generating answer...</p>
                        ) : entry.error ? (
                          <p className="mt-2 text-sm text-destructive">{entry.error}</p>
                        ) : (
                          <>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{entry.answer}</p>

                            <div className="mt-3 rounded-lg border border-dashed border-border/70 bg-muted/15 p-2.5">
                              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                <Wand2 className="h-3 w-3" />
                                Refine
                              </div>
                              <div className="mb-1.5 flex flex-wrap gap-1">
                                {["Make it shorter", "More casual", "More confident", "Add more detail"].map((prompt) => (
                                  <button
                                    key={prompt}
                                    type="button"
                                    disabled={entry.refining}
                                    onClick={() => refineAnswer(entry.id, prompt)}
                                    className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
                                  >
                                    {prompt}
                                  </button>
                                ))}
                              </div>
                              <div className="flex gap-1.5">
                                <input
                                  value={entry.refineDraft}
                                  onChange={(event) =>
                                    updateJobResults((results) =>
                                      results.map((item) => (item.id === entry.id ? { ...item, refineDraft: event.target.value } : item)),
                                    )
                                  }
                                  placeholder="Or type your own tweak..."
                                  className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      refineAnswer(entry.id, entry.refineDraft);
                                    }
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 shrink-0 rounded-md px-2 text-[11px]"
                                  disabled={entry.refining || !entry.refineDraft.trim()}
                                  onClick={() => refineAnswer(entry.id, entry.refineDraft)}
                                >
                                  {entry.refining ? "Refining..." : "Refine"}
                                </Button>
                              </div>
                            </div>

                            {entry.keyPoints.length > 0 ? (
                              <div className="mt-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key points</p>
                                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                                  {entry.keyPoints.map((point) => (
                                    <li key={point}>• {point}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {entry.followUps.length > 0 ? (
                              <div className="mt-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Follow-ups</p>
                                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                                  {entry.followUps.map((point) => (
                                    <li key={point}>• {point}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  if (!user) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6 bg-[#eef4ff]">
      <PageHeader
        title={activeWorkspace?.name ?? "Queue studio"}
        description="Create today's folder, choose a download destination, and let resume jobs flow through the queue without blocking the screen."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/bidder/resume")}>
              ← Setup
            </Button>
            <Button
              variant="outline"
              onClick={handleChooseFolder}
              className="border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            >
              <FolderOpen className="mr-1.5 h-4 w-4" />
              {downloadFolderName ?? "Set folder"}
            </Button>
            <Button variant="outline" onClick={() => navigate("/bidder/workspaces")}>
              <FolderPlus className="mr-1.5 h-4 w-4" />
              Workspaces
            </Button>
            <Button variant="outline" onClick={handleExportApplications}>
              <Download className="mr-1.5 h-4 w-4" />
              Export to spreadsheet
            </Button>
            <Button onClick={() => setGeneratePanelOpen(true)}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Generate resume
            </Button>
          </div>
        }
      />

      {!activeWorkspace ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div>Pick or create today&apos;s folder in Workspaces before generating resumes.</div>
          <Button size="sm" variant="outline" onClick={() => navigate("/bidder/workspaces")}>
            Open workspaces
          </Button>
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Past days</h2>
              <p className="text-xs text-muted-foreground">Open any saved folder and jump straight back into that queue.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/bidder/workspaces")}>
              <FolderPlus className="mr-1.5 h-4 w-4" />
              Manage folders
            </Button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {queueStore.workspaces.length > 0 ? (
              queueStore.workspaces.map((workspace) => {
                const stats = workspaceStats.get(workspace.id) ?? createEmptyWorkspaceStats();
                const active = selectedWorkspaceId === workspace.id;
                return (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => {
                      setSelectedWorkspaceId(workspace.id);
                      setQueueStore((current) => setActiveWorkspace(current, workspace.id));
                    }}
                    className={[
                      "min-w-[190px] rounded-xl border px-3 py-2 text-left transition",
                      active
                        ? "border-primary/40 bg-primary/5 shadow-sm"
                        : "border-border bg-background hover:border-primary/25 hover:bg-muted/30",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{workspace.name}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {stats.total} jobs · updated {formatQueueTimestamp(stats.latestAt ?? workspace.updatedAt)}
                        </p>
                      </div>
                      {active ? (
                        <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">
                          Active
                        </Badge>
                      ) : null}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
                No saved folders yet. Create today&apos;s folder in Workspaces first.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Queue</h2>
                <p className="text-xs text-muted-foreground">
                  Jobs stay here while they queue, generate, review, and save into the selected folder.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                    {activeWorkspace?.name ?? "No folder selected"}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                    {activeWorkspaceStats.total} jobs
                  </Badge>
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                    {activeWorkspaceStats.running} running
                  </Badge>
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                    {activeWorkspaceStats.ready} ready
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                  {queueJobs.length} visible
                </Badge>
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                  {queueStats.generating} running
                </Badge>
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-5">
              <QueueStat label="Queued" value={queueStats.queued} tone="muted" />
              <QueueStat label="Generating" value={queueStats.generating} tone="info" />
              <QueueStat label="Ready" value={queueStats.ready} tone="success" />
              <QueueStat label="QA" value={queueStats.qa} tone="warning" />
              <QueueStat label="Failed" value={queueStats.failed} tone="destructive" />
            </div>

            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-wrap gap-2">
                <Input
                  value={queueSearch}
                  onChange={(event) => setQueueSearch(event.target.value)}
                  placeholder="Search roles, companies, notes, or JD text..."
                  className="min-w-[220px] lg:max-w-md"
                />
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as QueueFilter)}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                    <SelectItem value="running">Generating</SelectItem>
                    <SelectItem value="succeeded">Ready</SelectItem>
                    <SelectItem value="qa_required">QA required</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortMode} onValueChange={(value) => setSortMode(value as QueueSortMode)}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="Newest first" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="fastest">Fastest first</SelectItem>
                    <SelectItem value="slowest">Slowest first</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => void refetchJobs()}>
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Refresh
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Active folder:</span>
                <Badge variant="outline" className="rounded-full px-2 py-0 text-[11px]">
                  {activeWorkspace?.name ?? "None"}
                </Badge>
                {jobsFetching ? (
                  <Badge variant="secondary" className="rounded-full px-2 py-0 text-[11px]">
                    Syncing queue
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="hidden xl:grid xl:grid-cols-[48px_minmax(0,1.1fr)_132px_112px_78px_96px_110px_152px] xl:items-center xl:gap-2.5 xl:border-y xl:border-border/70 xl:bg-muted/35 xl:px-4 xl:py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">S NO.</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Role &amp; Company</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Submitted</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Status</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Duration</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Job Link</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Skip Reason</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Actions</div>
            </div>

            {queueIsSyncing ? (
              <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/10 p-5">
                <div className="h-4 w-44 animate-pulse rounded bg-muted/60" />
                <div className="grid gap-2">
                  <div className="h-14 animate-pulse rounded-lg bg-muted/50" />
                  <div className="h-14 animate-pulse rounded-lg bg-muted/50" />
                  <div className="h-14 animate-pulse rounded-lg bg-muted/50" />
                </div>
                <p className="text-xs text-muted-foreground">Loading queue snapshots from the background service...</p>
              </div>
            ) : queueJobs.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {queueJobs.map((job, index) => renderQueueJob(job, index))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/10 p-10 text-center text-sm text-muted-foreground">
                No queue items yet. Generate a resume to start filling the folder.
              </div>
            )}
          </div>
      </div>

      <Dialog open={generatePanelOpen} onOpenChange={setGeneratePanelOpen}>
        <DialogContent className="max-h-[88vh] w-[min(100vw-1.5rem,640px)] overflow-hidden p-0">
          <div className="max-h-[88vh] overflow-auto p-6">
            <DialogHeader className="space-y-2">
              <DialogTitle>Generate resume</DialogTitle>
              <DialogDescription>
                Add the job details here, then queue the resume into the selected folder without taking over the whole screen.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 space-y-4">
              <div className="space-y-1.5 rounded-lg border border-dashed border-border bg-muted/20 p-3">
                <Label htmlFor="jobBoardPaste">Highlight &amp; paste job board listings</Label>
                <Textarea
                  id="jobBoardPaste"
                  rows={5}
                  value={jobBoardPaste}
                  onChange={(event) => setJobBoardPaste(event.target.value)}
                  placeholder="Highlight and paste a chunk of job board search results (one or many listings)..."
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Pulls out every company mentioned and shows only the ones you're clear to apply to.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={filterCompanies.isPending || !jobBoardPaste.trim()}
                    onClick={() => filterCompanies.mutate()}
                  >
                    {filterCompanies.isPending ? "Checking..." : "Check companies"}
                  </Button>
                </div>

                {clearCompanies && (
                  <div className="rounded-md border border-border bg-background p-2.5">
                    {clearCompanies.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {companyFilterStats?.totalExtracted
                          ? "Every company found is already blocked — none are clear to apply to right now."
                          : "No companies found in that text."}
                      </p>
                    ) : (
                      <>
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                          Clear to apply to ({clearCompanies.length}
                          {companyFilterStats?.blockedCount ? ` — ${companyFilterStats.blockedCount} filtered out` : ""}):
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {clearCompanies.map((name) => (
                            <button
                              key={name}
                              type="button"
                              onClick={() => {
                                setCompany(name);
                                setDuplicateCheck(null);
                              }}
                              className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                          Click a name to drop it into the Company field below.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {duplicateCheck?.blocked && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  You already applied to {company || "this company"} on {duplicateCheck.appliedOn}. Blocked from
                  reapplying for {duplicateCheck.cooldownDays} days.
                </div>
              )}
              {duplicateCheck && !duplicateCheck.blocked && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  No recent application found for {company || "this company"} — clear to generate.
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="jobTitle">Job title</Label>
                  <Input id="jobTitle" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company">Company</Label>
                  <div className="flex gap-1.5">
                    <Input
                      id="company"
                      value={company}
                      onChange={(event) => {
                        setCompany(event.target.value);
                        setDuplicateCheck(null);
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={recheckCompany.isPending || !company.trim()}
                      onClick={() => recheckCompany.mutate()}
                    >
                      {recheckCompany.isPending ? "..." : "Check"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="jobUrl">Job URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <div className="flex gap-1.5">
                  <Input
                    id="jobUrl"
                    value={jobUrl}
                    onChange={(event) => setJobUrl(event.target.value)}
                    placeholder="https://..."
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={fetchFromUrl.isPending || !jobUrl.trim()}
                    onClick={() => fetchFromUrl.mutate()}
                  >
                    {fetchFromUrl.isPending ? "Fetching..." : "Fetch details"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tries to auto-fill job title, company, and description from the link. Some job boards block this — paste the text above if it fails.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Resume template</Label>
                <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={resumeTemplates.length ? "Select resume template" : "No templates assigned"} />
                  </SelectTrigger>
                  <SelectContent>
                    {resumeTemplates.map((template: ResumeTemplate) => (
                      <SelectItem key={template.id} value={template.id}>
                        <div className="flex items-center gap-2">
                          <span>{template.title}</span>
                          {template.isUsableForGeneration === false ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              review
                            </span>
                          ) : null}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedResumeTemplate?.isUsableForGeneration === false ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    This template includes instruction text. The backend will try to extract the structured resume data first.
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="jobDescription">Job description</Label>
                <Textarea
                  id="jobDescription"
                  rows={8}
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  placeholder="Paste the role description here..."
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {downloadFolderReady ? "Auto-save is ready for this browser session." : "Choose a download folder before generating so the file saves automatically."}
                </p>
                <Button
                  onClick={() => {
                    const started = handleGenerate();
                    if (started) setGeneratePanelOpen(false);
                  }}
                >
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  Queue resume
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewJobId} onOpenChange={(open) => !open && setPreviewJobId(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{selectedPreviewJob ? `${getJobTitle(selectedPreviewJob)} - ${getJobCompany(selectedPreviewJob)}` : "Resume preview"}</DialogTitle>
            <DialogDescription>
              Preview the generated resume and export it manually if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-auto rounded-lg border border-border bg-muted/10 p-3">
            {selectedPreviewJob ? (
              <ResumeDocumentPreview
                content={normalizeGeneratedResumePreview(getJobPreview(selectedPreviewJob), "")}
                structured={getStructuredForJob(selectedPreviewJob)}
              />
            ) : null}
          </div>
          {selectedPreviewJob ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => void manualDownload(selectedPreviewJob, "pdf")}>
                <Download className="mr-1.5 h-4 w-4" />
                Download PDF
              </Button>
              <Button variant="outline" onClick={() => void manualDownload(selectedPreviewJob, "docx")}>
                <Download className="mr-1.5 h-4 w-4" />
                Download DOCX
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!noteJobId} onOpenChange={(open) => !open && setNoteJobId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedNoteJob ? `Add note - ${getJobTitle(selectedNoteJob)}` : "Add note"}</DialogTitle>
            <DialogDescription>Save a local note for issues, reminders, or follow-up on this queue item.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Write a note about the job or resume here..."
              rows={7}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNoteJobId(null)}>
                Cancel
              </Button>
              <Button onClick={() => void saveJobNote()}>
                <Save className="mr-1.5 h-4 w-4" />
                Save note
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QueueStat({ label, value, tone }: { label: string; value: number; tone: QueueTone }) {
  const toneClasses: Record<QueueTone, string> = {
    muted: "bg-muted/60 text-muted-foreground",
    info: "bg-[hsl(var(--info)/0.12)] text-[hsl(var(--info))]",
    success: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
    warning: "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]",
    destructive: "bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]",
  } as const;

  return (
    <div className={`rounded-lg border border-border px-3 py-3 text-sm ${toneClasses[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function FolderCounter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background px-2.5 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function WorkbenchMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function buildQueueSearchText(job: QueueViewJob) {
  return [
    job.id,
    job.kind,
    job.status,
    job.workspaceName,
    getJobTitle(job),
    getJobCompany(job),
    getJobDescription(job),
    job.note,
    job.error ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function isLiveResumeQueueEvent(
  event: RealtimeEvent<{
    job: {
      id: string;
      status: string;
      result?: {
        preview?: string;
        markdown?: string;
        content?: string;
        structured?: GeneratedResumeStructured;
        meta?: { generatedResumeId?: string };
        score?: {
          overall: number;
          keywordCoverage: number;
          skillCoverage: number;
          quantifiedAchievementScore: number;
          bulletQualityScore: number;
          matchedKeywords: string[];
          missingKeywords: string[];
        };
      };
      error?: string;
    };
  }>,
) {
  return event && typeof event === "object" && "data" in event && !!event.data?.job?.id;
}



