import type { BackgroundJob } from "@/lib/types";

type DirectoryHandleLike = {
  name: string;
  queryPermission?: (options: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob | ArrayBuffer | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

export type BidderWorkspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type BidderQueueStore = {
  activeWorkspaceId: string | null;
  workspaces: BidderWorkspace[];
  jobWorkspaceMap: Record<string, string>;
  jobNotes: Record<string, string>;
  downloadFolderName: string | null;
  downloadFolderSavedAt: string | null;
};

const STORAGE_PREFIX = "topbrass:bidder:queue-store:";
const JOBS_CACHE_PREFIX = "topbrass:bidder:jobs-cache:";
const DB_NAME = "topbrass-bidder-file-store";
const DB_VERSION = 1;
const HANDLE_STORE = "directory-handles";

function createId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `workspace_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function jobsCacheKey(userId: string) {
  return `${JOBS_CACHE_PREFIX}${userId}`;
}

function formatDailyWorkspaceName(date = new Date()) {
  return date.toLocaleDateString("en-CA");
}

function defaultWorkspaceName() {
  return formatDailyWorkspaceName();
}

function createWorkspaceRecord(name: string): BidderWorkspace {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: name.trim() || defaultWorkspaceName(),
    createdAt: now,
    updatedAt: now,
  };
}

export function emptyBidderQueueStore(): BidderQueueStore {
  return {
    activeWorkspaceId: null,
    workspaces: [],
    jobWorkspaceMap: {},
    jobNotes: {},
    downloadFolderName: null,
    downloadFolderSavedAt: null,
  };
}

export function bootstrapBidderQueueStore(userId: string) {
  return loadBidderQueueStore(userId);
}

export function loadBidderQueueStore(userId: string): BidderQueueStore {
  if (typeof window === "undefined") {
    return emptyBidderQueueStore();
  }

  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return emptyBidderQueueStore();

    const parsed = JSON.parse(raw) as Partial<BidderQueueStore>;
    return {
      activeWorkspaceId: typeof parsed.activeWorkspaceId === "string" ? parsed.activeWorkspaceId : null,
      workspaces: Array.isArray(parsed.workspaces)
        ? parsed.workspaces
            .map((workspace) => {
              if (!workspace || typeof workspace !== "object") return null;
              const item = workspace as Partial<BidderWorkspace>;
              if (!item.id || !item.name) return null;
              return {
                id: String(item.id),
                name: String(item.name),
                createdAt: String(item.createdAt ?? new Date().toISOString()),
                updatedAt: String(item.updatedAt ?? item.createdAt ?? new Date().toISOString()),
              };
            })
            .filter(Boolean) as BidderWorkspace[]
        : [],
      jobWorkspaceMap:
        parsed.jobWorkspaceMap && typeof parsed.jobWorkspaceMap === "object"
          ? Object.fromEntries(
              Object.entries(parsed.jobWorkspaceMap).filter(([key, value]) => typeof key === "string" && typeof value === "string"),
            )
          : {},
      jobNotes:
        parsed.jobNotes && typeof parsed.jobNotes === "object"
          ? Object.fromEntries(
              Object.entries(parsed.jobNotes).filter(([key, value]) => typeof key === "string" && typeof value === "string"),
            )
          : {},
      downloadFolderName: typeof parsed.downloadFolderName === "string" ? parsed.downloadFolderName : null,
      downloadFolderSavedAt: typeof parsed.downloadFolderSavedAt === "string" ? parsed.downloadFolderSavedAt : null,
    };
  } catch {
    return emptyBidderQueueStore();
  }
}

export function saveBidderQueueStore(userId: string, store: BidderQueueStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(userId), JSON.stringify(store));
}

export function loadBidderJobsCache(userId: string): BackgroundJob[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(jobsCacheKey(userId));
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((job) => {
        if (!job || typeof job !== "object") return null;
        const item = job as Partial<BackgroundJob>;
        if (!item.id || !item.kind || !item.status || !item.createdAt) return null;
        const result = item.result && typeof item.result === "object" ? { ...item.result } : undefined;
        if (result && typeof result === "object") {
          for (const key of ["preview", "content", "markdown"] as const) {
            if (typeof result[key] === "string" && result[key].length > 6000) {
              result[key] = `${result[key].slice(0, 6000)}…`;
            }
          }
        }
        return {
          id: String(item.id),
          kind: String(item.kind),
          status: String(item.status) as BackgroundJob["status"],
          attempts: Number(item.attempts ?? 0),
          maxAttempts: Number(item.maxAttempts ?? 1),
          progress: Number(item.progress ?? 0),
          createdAt: String(item.createdAt),
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
          startedAt: typeof item.startedAt === "string" ? item.startedAt : undefined,
          finishedAt: typeof item.finishedAt === "string" ? item.finishedAt : undefined,
          error: typeof item.error === "string" ? item.error : undefined,
          payload: item.payload && typeof item.payload === "object" && !Array.isArray(item.payload) ? (item.payload as Record<string, unknown>) : undefined,
          result: result as Record<string, unknown> | undefined,
        } satisfies BackgroundJob;
      })
      .filter((job): job is BackgroundJob => Boolean(job));
  } catch {
    return [];
  }
}

export function saveBidderJobsCache(userId: string, jobs: BackgroundJob[]) {
  if (typeof window === "undefined") return;

  try {
    const trimmed = jobs.map((job) => {
      const result = job.result && typeof job.result === "object" && !Array.isArray(job.result) ? { ...job.result } : undefined;
      if (result) {
        for (const key of ["preview", "content", "markdown"] as const) {
          if (typeof result[key] === "string" && result[key].length > 6000) {
            result[key] = `${result[key].slice(0, 6000)}…`;
          }
        }
      }
      return {
        ...job,
        result,
      };
    });
    window.localStorage.setItem(jobsCacheKey(userId), JSON.stringify(trimmed));
  } catch {
    // Ignore storage quota or serialization failures.
  }
}

export function createWorkspace(store: BidderQueueStore, name: string) {
  const workspace = createWorkspaceRecord(name);
  const next: BidderQueueStore = {
    ...store,
    workspaces: [workspace, ...store.workspaces.filter((item) => item.id !== workspace.id)],
    activeWorkspaceId: workspace.id,
  };
  return { store: next, workspace };
}

export function createOrSelectWorkspace(store: BidderQueueStore, name: string) {
  const nextName = name.trim() || defaultWorkspaceName();
  const existing = store.workspaces.find(
    (workspace) => workspace.name.trim().toLowerCase() === nextName.toLowerCase(),
  );

  if (existing) {
    return {
      store: setActiveWorkspace(store, existing.id),
      workspace: existing,
      created: false,
    };
  }

  const created = createWorkspace(store, nextName);
  return {
    store: created.store,
    workspace: created.workspace,
    created: true,
  };
}

export function renameWorkspace(store: BidderQueueStore, workspaceId: string, name: string) {
  const nextName = name.trim() || defaultWorkspaceName();
  const now = new Date().toISOString();
  return {
    ...store,
    workspaces: store.workspaces.map((workspace) =>
      workspace.id === workspaceId
        ? { ...workspace, name: nextName, updatedAt: now }
        : workspace,
    ),
  };
}

export function setActiveWorkspace(store: BidderQueueStore, workspaceId: string) {
  return {
    ...store,
    activeWorkspaceId: workspaceId,
  };
}

export function removeWorkspace(store: BidderQueueStore, workspaceId: string) {
  const remaining = store.workspaces.filter((workspace) => workspace.id !== workspaceId);
  const nextActive = store.activeWorkspaceId === workspaceId ? remaining[0]?.id ?? null : store.activeWorkspaceId;
  const nextMap = Object.fromEntries(
    Object.entries(store.jobWorkspaceMap).filter(([, mappedWorkspaceId]) => mappedWorkspaceId !== workspaceId),
  );

  return {
    ...store,
    workspaces: remaining,
    activeWorkspaceId: nextActive,
    jobWorkspaceMap: nextMap,
  };
}

export function assignJobToWorkspace(store: BidderQueueStore, jobId: string, workspaceId: string) {
  const now = new Date().toISOString();
  const workspaceExists = store.workspaces.some((workspace) => workspace.id === workspaceId);
  const activeWorkspaceId = workspaceExists ? workspaceId : store.activeWorkspaceId;

  return {
    ...store,
    activeWorkspaceId,
    jobWorkspaceMap: {
      ...store.jobWorkspaceMap,
      [jobId]: activeWorkspaceId ?? workspaceId,
    },
    workspaces: store.workspaces.map((workspace) =>
      workspace.id === (activeWorkspaceId ?? workspaceId)
        ? { ...workspace, updatedAt: now }
        : workspace,
    ),
  };
}

export function setJobNote(store: BidderQueueStore, jobId: string, note: string) {
  const now = new Date().toISOString();
  const workspaceId = store.jobWorkspaceMap[jobId];
  return {
    ...store,
    jobNotes: {
      ...store.jobNotes,
      [jobId]: note,
    },
    workspaces: workspaceId
      ? store.workspaces.map((workspace) =>
          workspace.id === workspaceId ? { ...workspace, updatedAt: now } : workspace,
        )
      : store.workspaces,
  };
}

export function updateDownloadFolderMeta(store: BidderQueueStore, folderName: string | null) {
  return {
    ...store,
    downloadFolderName: folderName,
    downloadFolderSavedAt: folderName ? new Date().toISOString() : null,
  };
}

function readStore<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
  });
}

async function openDirectoryHandleDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this browser.");
  }

  const open = indexedDB.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains(HANDLE_STORE)) {
      db.createObjectStore(HANDLE_STORE);
    }
  };

  return readStore(open);
}

async function getStoredDirectoryHandle(userId: string): Promise<DirectoryHandleLike | null> {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  const db = await openDirectoryHandleDb();
  try {
    const tx = db.transaction(HANDLE_STORE, "readonly");
    const store = tx.objectStore(HANDLE_STORE);
    const result = await readStore(store.get(`download-folder:${userId}`));
    return (result as DirectoryHandleLike | undefined) ?? null;
  } finally {
    db.close();
  }
}

async function setStoredDirectoryHandle(userId: string, handle: DirectoryHandleLike) {
  const db = await openDirectoryHandleDb();
  try {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    const store = tx.objectStore(HANDLE_STORE);
    await readStore(store.put(handle, `download-folder:${userId}`));
  } finally {
    db.close();
  }
}

async function ensureWritablePermission(handle: DirectoryHandleLike) {
  if (!handle.queryPermission || !handle.requestPermission) {
    return true;
  }

  const current = await handle.queryPermission({ mode: "readwrite" });
  if (current === "granted") return true;
  const requested = await handle.requestPermission({ mode: "readwrite" });
  return requested === "granted";
}

export async function chooseDownloadFolder(userId: string) {
  if (typeof window === "undefined") {
    throw new Error("Folder selection is only available in the browser.");
  }

  const picker = (window as Window & {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<DirectoryHandleLike>;
  }).showDirectoryPicker;

  if (!picker) {
    throw new Error("Your browser does not support folder selection. Chrome or Edge is recommended.");
  }

  const handle = await picker({ mode: "readwrite" });
  await setStoredDirectoryHandle(userId, handle);
  return handle;
}

export async function loadDownloadFolderName(userId: string) {
  const handle = await getStoredDirectoryHandle(userId);
  return handle?.name ?? null;
}

export async function saveBlobToSelectedFolder(userId: string, fileName: string, blob: Blob) {
  const handle = await getStoredDirectoryHandle(userId);
  if (!handle) {
    return { saved: false, reason: "No download folder selected." };
  }

  const allowed = await ensureWritablePermission(handle);
  if (!allowed) {
    return { saved: false, reason: "Permission to write to the folder was denied." };
  }

  const safeName = sanitizeResumeFileName(fileName);
  const fileHandle = await handle.getFileHandle(safeName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();

  return {
    saved: true,
    folderName: handle.name || "Selected folder",
    fileName: safeName,
  };
}

export function sanitizeResumeFileName(fileName: string) {
  const trimmed = fileName.trim() || "resume.pdf";
  const withoutIllegalChars = trimmed.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ").trim();
  const normalized = withoutIllegalChars.replace(/\s+/g, "_").replace(/_+/g, "_");
  return normalized || "resume.pdf";
}
