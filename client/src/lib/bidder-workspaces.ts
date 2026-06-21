import type { BackgroundJob } from "@/lib/types";
import { createOrSelectWorkspace, setActiveWorkspace, type BidderQueueStore } from "@/lib/bidder-queue-storage";

export type WorkspaceCardStats = {
  total: number;
  queued: number;
  running: number;
  ready: number;
  qa: number;
  failed: number;
  latestAt: string | null;
};

function createEmptyWorkspaceStats(): WorkspaceCardStats {
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

export function formatWorkspaceDateLabel(date = new Date()) {
  return date.toLocaleDateString("en-CA");
}

function getWorkspaceJobBucket(job: BackgroundJob) {
  if (job.status === "queued") return "queued";
  if (job.status === "running" || job.status === "processing" || job.status === "retrying") return "running";
  if (job.status === "succeeded" || job.status === "completed") return "ready";
  if (job.status === "qa_required") return "qa";
  return "failed";
}

export function buildWorkspaceStats(store: BidderQueueStore, jobs: BackgroundJob[]) {
  const statsById = new Map<string, WorkspaceCardStats>();

  for (const job of jobs) {
    if (job.kind !== "resume_generate") continue;

    const workspaceId = store.jobWorkspaceMap[job.id] ?? null;
    if (!workspaceId) continue;

    const current = statsById.get(workspaceId) ?? createEmptyWorkspaceStats();
    const bucket = getWorkspaceJobBucket(job);
    current.total += 1;
    current[bucket] += 1;

    const timestamp = job.updatedAt ?? job.finishedAt ?? job.startedAt ?? job.createdAt;
    if (timestamp && (!current.latestAt || new Date(timestamp).getTime() > new Date(current.latestAt).getTime())) {
      current.latestAt = timestamp;
    }

    statsById.set(workspaceId, current);
  }

  return statsById;
}

export function createDailyWorkspace(store: BidderQueueStore) {
  return createOrSelectWorkspace(store, formatWorkspaceDateLabel());
}

export function activateWorkspace(store: BidderQueueStore, workspaceId: string) {
  return setActiveWorkspace(store, workspaceId);
}
