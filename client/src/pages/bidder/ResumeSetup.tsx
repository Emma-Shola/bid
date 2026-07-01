import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, FileText, FolderOpen, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  bootstrapBidderQueueStore,
  chooseDownloadFolder,
  createOrSelectWorkspace,
  loadDownloadFolderName,
  saveBidderQueueStore,
  setActiveWorkspace,
  type BidderQueueStore,
} from "@/lib/bidder-queue-storage";
import type { ResumeTemplate } from "@/lib/types";

function todayLabel() {
  return new Date().toLocaleDateString("en-CA");
}

function StepBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        done
          ? "bg-emerald-500 text-white"
          : "bg-primary/10 text-primary",
      )}
    >
      {done ? <CheckCircle2 className="h-4 w-4" /> : n}
    </div>
  );
}

export default function ResumeSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [sessionName, setSessionName] = useState(todayLabel);
  const [sessionWorkspaceId, setSessionWorkspaceId] = useState<string | null>(null);
  const [downloadFolderName, setDownloadFolderName] = useState<string | null>(null);
  const [queueStore, setQueueStore] = useState<BidderQueueStore>(() =>
    bootstrapBidderQueueStore(user?.id ?? "guest"),
  );

  const { data: resumeTemplates = [] } = useQuery({
    queryKey: ["resumes", "bidder"],
    queryFn: () => api.listResumes(),
    enabled: !!user,
  });

  // Load existing state from localStorage
  useEffect(() => {
    if (!user?.id) return;
    const store = bootstrapBidderQueueStore(user.id);
    setQueueStore(store);

    // Pre-select active workspace if it exists
    if (store.activeWorkspaceId) {
      const active = store.workspaces.find((w) => w.id === store.activeWorkspaceId);
      if (active) {
        setSessionWorkspaceId(active.id);
        setSessionName(active.name);
      }
    }

    // Load download folder
    loadDownloadFolderName(user.id)
      .then((name) => setDownloadFolderName(name))
      .catch(() => null);
  }, [user?.id]);

  // Auto-select first template if only one available
  useEffect(() => {
    if (resumeTemplates.length === 1 && !selectedResumeId) {
      setSelectedResumeId(resumeTemplates[0].id);
    }
  }, [resumeTemplates, selectedResumeId]);

  // Auto-create today's session if workspace state was lost (e.g. new device / cleared storage)
  useEffect(() => {
    if (!user?.id || sessionWorkspaceId) return;
    const { store: next, workspace: ws } = createOrSelectWorkspace(queueStore, todayLabel());
    saveBidderQueueStore(user.id, next);
    setQueueStore(next);
    setSessionWorkspaceId(ws.id);
    setSessionName(ws.name);
  }, [user?.id, sessionWorkspaceId, queueStore]);

  // Once all three conditions are met after async data loads, go straight to the queue
  const templatesLoaded = resumeTemplates.length > 0;
  useEffect(() => {
    if (selectedResumeId && sessionWorkspaceId && downloadFolderName && templatesLoaded) {
      navigate("/bidder/resume/queue", {
        state: { resumeId: selectedResumeId, workspaceId: sessionWorkspaceId },
        replace: true,
      });
    }
  }, [selectedResumeId, sessionWorkspaceId, downloadFolderName, templatesLoaded, navigate]);

  function handleCreateSession() {
    if (!user?.id) return;
    const name = sessionName.trim() || todayLabel();
    const { store: next, workspace: ws } = createOrSelectWorkspace(queueStore, name);
    saveBidderQueueStore(user.id, next);
    setQueueStore(next);
    setSessionWorkspaceId(ws.id);
    toast.success(`Session "${ws.name}" ready`);
  }

  async function handleChooseFolder() {
    if (!user?.id) return;
    try {
      const handle = await chooseDownloadFolder(user.id);
      setDownloadFolderName(handle.name || "Selected folder");
      toast.success(`Download folder set to "${handle.name || "Selected folder"}"`);
    } catch {
      toast.error("Could not select a download folder");
    }
  }

  const allDone = !!selectedResumeId && !!sessionWorkspaceId && !!downloadFolderName;

  function handleStart() {
    if (!allDone) return;
    navigate("/bidder/resume/queue", {
      state: { resumeId: selectedResumeId, workspaceId: sessionWorkspaceId },
    });
  }

  if (!user) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const selectedTemplate = resumeTemplates.find((t) => t.id === selectedResumeId) ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-2">
      <PageHeader
        title="Start a bidding session"
        description="Pick a resume, name today's session, then choose where files should save — then begin."
      />

      {/* Step 1 — Resume */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <StepBadge n={1} done={!!selectedResumeId} />
          <div>
            <p className="text-sm font-semibold">Select resume</p>
            <p className="text-xs text-muted-foreground">Choose which client profile to generate for.</p>
          </div>
        </div>

        {resumeTemplates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No resume templates assigned to you yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {resumeTemplates.map((t: ResumeTemplate) => {
              const active = selectedResumeId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedResumeId(t.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition hover:shadow-sm",
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-background hover:border-primary/40",
                  )}
                >
                  <FileText
                    className={cn("mt-0.5 h-5 w-5 shrink-0", active ? "text-primary" : "text-muted-foreground")}
                  />
                  <div className="min-w-0">
                    <p className={cn("truncate text-sm font-medium", active ? "text-primary" : "text-foreground")}>
                      {t.title}
                    </p>
                    {t.managerName ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.managerName}</p>
                    ) : null}
                    {t.isUsableForGeneration === false ? (
                      <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        needs review
                      </span>
                    ) : null}
                  </div>
                  {active ? <CheckCircle2 className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-primary" /> : null}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Step 2 — Session date */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <StepBadge n={2} done={!!sessionWorkspaceId} />
          <div>
            <p className="text-sm font-semibold">Create session</p>
            <p className="text-xs text-muted-foreground">Name today's folder — defaults to today's date.</p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={sessionName}
              onChange={(e) => {
                setSessionName(e.target.value);
                setSessionWorkspaceId(null);
              }}
              placeholder="e.g. 2025-06-27"
            />
          </div>
          <Button
            type="button"
            variant={sessionWorkspaceId ? "outline" : "default"}
            onClick={handleCreateSession}
          >
            {sessionWorkspaceId ? "Change" : "Create"}
          </Button>
        </div>

        {sessionWorkspaceId ? (
          <p className="mt-2 text-xs text-emerald-600">
            Session "{queueStore.workspaces.find((w) => w.id === sessionWorkspaceId)?.name}" is ready.
          </p>
        ) : queueStore.workspaces.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-muted-foreground">Or pick an existing session:</p>
            <div className="flex flex-wrap gap-1.5">
              {queueStore.workspaces.slice(0, 6).map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    if (!user?.id) return;
                    const withActive = setActiveWorkspace(queueStore, w.id);
                    saveBidderQueueStore(user.id, withActive);
                    setQueueStore(withActive);
                    setSessionWorkspaceId(w.id);
                    setSessionName(w.name);
                  }}
                  className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs hover:border-primary/50 hover:bg-primary/5"
                >
                  {w.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Step 3 — Download folder */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <StepBadge n={3} done={!!downloadFolderName} />
          <div>
            <p className="text-sm font-semibold">Set download folder</p>
            <p className="text-xs text-muted-foreground">Generated resumes will save here automatically.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={handleChooseFolder} className="gap-2">
            <FolderOpen className="h-4 w-4" />
            {downloadFolderName ? "Change folder" : "Choose folder"}
          </Button>
          {downloadFolderName ? (
            <span className="text-sm text-emerald-600 font-medium truncate max-w-xs">{downloadFolderName}</span>
          ) : (
            <span className="text-xs text-muted-foreground">No folder selected yet.</span>
          )}
        </div>
      </section>

      {/* Summary & CTA */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-6 py-4 shadow-sm">
        <div className="text-sm text-muted-foreground">
          {allDone ? (
            <span className="font-medium text-foreground">
              Ready — {selectedTemplate?.title} · {queueStore.workspaces.find((w) => w.id === sessionWorkspaceId)?.name}
            </span>
          ) : (
            "Complete all three steps above to begin."
          )}
        </div>
        <Button size="lg" disabled={!allDone} onClick={handleStart} className="gap-2 shrink-0">
          <Sparkles className="h-4 w-4" />
          Begin session
        </Button>
      </div>
    </div>
  );
}
