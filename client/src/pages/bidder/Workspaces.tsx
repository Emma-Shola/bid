import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowRight, Folder, FolderPlus, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildWorkspaceStats, formatWorkspaceDateLabel } from "@/lib/bidder-workspaces";
import {
  bootstrapBidderQueueStore,
  createOrSelectWorkspace,
  loadBidderJobsCache,
  saveBidderJobsCache,
  saveBidderQueueStore,
  setActiveWorkspace,
  type BidderQueueStore,
} from "@/lib/bidder-queue-storage";
import type { BackgroundJob } from "@/lib/types";

function formatWorkspaceUpdatedAt(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function WorkspaceCounter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#d9e4fb] bg-[#f8fbff] px-2 py-1 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function WorkspaceCard({
  workspace,
  active,
  total,
  queued,
  running,
  ready,
  failed,
  latestAt,
  onOpen,
}: {
  workspace: BidderQueueStore["workspaces"][number];
  active: boolean;
  total: number;
  queued: number;
  running: number;
  ready: number;
  failed: number;
  latestAt: string | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        active ? "border-emerald-300 ring-2 ring-emerald-100" : "border-[#d9e4fb]",
      )}
    >
      <div className="mb-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef4ff] text-blue-600">
        <Folder className="h-7 w-7" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="truncate text-lg font-semibold text-foreground">{workspace.name}</h3>
          {active ? (
            <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">
              Active
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {total} resumes ? Updated {formatWorkspaceUpdatedAt(latestAt ?? workspace.updatedAt)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2">
        <WorkspaceCounter label="All" value={total} />
        <WorkspaceCounter label="Queued" value={queued} />
        <WorkspaceCounter label="Running" value={running} />
        <WorkspaceCounter label="Ready" value={ready} />
        <WorkspaceCounter label="Failed" value={failed} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Open this folder and continue the day</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
    </button>
  );
}

export default function BidderWorkspaces() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [queueStore, setQueueStore] = useState<BidderQueueStore>(() => bootstrapBidderQueueStore(user?.id ?? "guest"));
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [workspaceName, setWorkspaceName] = useState(formatWorkspaceDateLabel());
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const store = bootstrapBidderQueueStore(user.id);
    setQueueStore(store);
    setSelectedWorkspaceId(store.activeWorkspaceId ?? store.workspaces[0]?.id ?? null);
    setJobs(loadBidderJobsCache(user.id));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    saveBidderQueueStore(user.id, queueStore);
  }, [queueStore, user?.id]);

  useEffect(() => {
    if (!selectedWorkspaceId && queueStore.workspaces[0]) {
      setSelectedWorkspaceId(queueStore.workspaces[0].id);
    }
  }, [queueStore.workspaces, selectedWorkspaceId]);

  const workspaceStats = useMemo(() => buildWorkspaceStats(queueStore, jobs), [jobs, queueStore]);
  const activeWorkspace = queueStore.workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;

  function handleRefresh() {
    if (!user?.id) return;
    setJobs(loadBidderJobsCache(user.id));
    toast.success("Workspace data refreshed");
  }

  function handleCreateWorkspace() {
    if (!user?.id) return;
    const name = workspaceName.trim() || formatWorkspaceDateLabel();
    const result = createOrSelectWorkspace(queueStore, name);
    saveBidderQueueStore(user.id, result.store);
    setQueueStore(result.store);
    setSelectedWorkspaceId(result.workspace.id);
    setWorkspaceName(formatWorkspaceDateLabel());
    setCreateOpen(false);
    saveBidderJobsCache(user.id, jobs);
    toast.success(result.created ? "Folder created" : "Folder selected");
  }

  function handleOpenWorkspace(workspaceId: string) {
    setQueueStore((current) => setActiveWorkspace(current, workspaceId));
    setSelectedWorkspaceId(workspaceId);
    navigate("/bidder/resume");
  }

  return (
    <div className="space-y-6 bg-[#eef4ff]">
      <PageHeader
        title="Workspaces"
        description="Create the day folder first, then move into the queue and keep each day's resumes grouped together."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Refresh
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <FolderPlus className="mr-1.5 h-4 w-4" />
                  New Workspace
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create a day folder</DialogTitle>
                  <DialogDescription>
                    Give the folder a name before you start working. We recommend the date so every day's queue stays
                    separated.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="workspace-name">
                    Folder name
                  </label>
                  <Input
                    id="workspace-name"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    placeholder="2026-06-10"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateWorkspace}>
                    <Sparkles className="mr-1.5 h-4 w-4" />
                    Create and start
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Create or select today's folder before you start generating. Every job for the day will stay inside that
        workspace.
      </div>

      {queueStore.workspaces.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#d9e4fb] bg-white p-8 text-center shadow-sm">
          <Folder className="mx-auto h-10 w-10 text-blue-500" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">No workspaces yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start the day by creating a folder for today. Your resume queue will be grouped here.
          </p>
          <Button className="mt-5" onClick={() => setCreateOpen(true)}>
            <FolderPlus className="mr-1.5 h-4 w-4" />
            Create today's folder
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {queueStore.workspaces.map((workspace) => {
            const stats = workspaceStats.get(workspace.id) ?? {
              total: 0,
              queued: 0,
              running: 0,
              ready: 0,
              qa: 0,
              failed: 0,
              latestAt: null,
            };

            return (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                active={activeWorkspace?.id === workspace.id}
                total={stats.total}
                queued={stats.queued}
                running={stats.running}
                ready={stats.ready}
                failed={stats.failed}
                latestAt={stats.latestAt}
                onOpen={() => handleOpenWorkspace(workspace.id)}
              />
            );
          })}
        </div>
      )}

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d9e4fb] bg-white p-5 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-foreground">Current folder</p>
          <p className="text-sm text-muted-foreground">
            {activeWorkspace?.name ?? "No folder selected. Create or pick today's folder to begin."}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/bidder/resume")}>Go to queue</Button>
      </div>
    </div>
  );
}
