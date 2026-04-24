import type {
  Application,
  ApplicationStatus,
  AuditLog,
  BackgroundJob,
  NotificationItem,
  Payment,
  ResumeTemplate,
  Role,
  User,
} from "./types";
import { extractResumePreview } from "./resume-output";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL?.trim().replace(/\/$/, "") ?? "";

type ApiEnvelope<T> = {
  data: T;
};

type ApiErrorEnvelope = {
  error?: string;
  details?: unknown;
};

type ValidationDetails = {
  fieldErrors?: Record<string, string[] | undefined>;
  formErrors?: string[];
};

type ApiUserRecord = {
  id: string;
  username: string;
  role: Role;
  isApproved: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  bidder?: {
    email: string;
    fullName: string;
    resumeUrl?: string | null;
    totalPaid?: number | null;
    managerId?: string | null;
    manager?: {
      id: string;
      username: string;
      managerProfile?: { fullName?: string | null; templateResumeUrl?: string | null } | null;
    } | null;
  } | null;
  managerProfile?: {
    email: string;
    fullName: string;
    templateResumeUrl?: string | null;
  } | null;
};

let refreshInFlight: Promise<boolean> | null = null;

function buildUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return BACKEND_URL ? `${BACKEND_URL}${normalized}` : normalized;
}

function isBareOriginUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

function resolveAssetUrl(url?: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (!url.startsWith("/")) return url;

  const resolved = BACKEND_URL ? `${BACKEND_URL}${url}` : url;
  if (BACKEND_URL && (isBareOriginUrl(resolved) || resolved === BACKEND_URL)) {
    return null;
  }

  if (resolved === "/" || resolved === "") {
    return null;
  }

  return resolved;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Unexpected server response");
  }
}

function isAuthPath(path: string) {
  return path.startsWith("/api/auth/");
}

async function tryRefreshSession() {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const response = await fetch(buildUrl("/api/auth/refresh"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function request<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const response = await fetch(buildUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers ?? {}),
    },
  });

  const body = (await readJson<ApiEnvelope<T> | ApiErrorEnvelope>(response)) ?? {};

  if (
    response.status === 401 &&
    allowRefresh &&
    !isAuthPath(path)
  ) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      return request<T>(path, init, false);
    }
  }

  if (!response.ok) {
    const errorBody = body as ApiErrorEnvelope;
    const details = errorBody.details as ValidationDetails | undefined;

    const firstFieldError = details?.fieldErrors
      ? Object.values(details.fieldErrors).find((messages) => Array.isArray(messages) && messages.length > 0)?.[0]
      : undefined;

    const firstFormError = details?.formErrors?.[0];

    const message =
      firstFieldError ?? firstFormError ?? errorBody.error ?? `Request failed with status ${response.status}`;

    const err = new Error(message);
    Object.assign(err, body);
    throw err;
  }

  return (body as ApiEnvelope<T>).data;
}

function mapUser(user: ApiUserRecord): User {
  const managerName = user.bidder?.manager?.managerProfile?.fullName ?? user.bidder?.manager?.username ?? null;

  return {
    id: user.id,
    email: user.bidder?.email ?? user.managerProfile?.email ?? user.username,
    name: user.bidder?.fullName ?? user.managerProfile?.fullName ?? user.username,
    username: user.username,
    fullName: user.bidder?.fullName ?? user.managerProfile?.fullName ?? user.username,
    role: user.role,
    status: user.isApproved ? "active" : "pending",
    isApproved: user.isApproved,
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : new Date().toISOString(),
    resumeUrl:
      resolveAssetUrl(
        user.bidder?.resumeUrl ??
          user.bidder?.manager?.managerProfile?.templateResumeUrl ??
          user.managerProfile?.templateResumeUrl ??
          null,
      ) ??
      null,
    templateResumeUrl:
      resolveAssetUrl(
        user.managerProfile?.templateResumeUrl ??
          user.bidder?.manager?.managerProfile?.templateResumeUrl ??
          null,
      ) ??
      null,
    managerId: user.bidder?.managerId ?? null,
    managerName,
    totalPaid: user.bidder?.totalPaid ?? 0,
  };
}

function mapApplication(app: {
  id: string;
  bidderId: string;
  jobTitle: string;
  company: string;
  jobUrl?: string | null;
  jobDescription: string;
  resumeUrl?: string | null;
  status: ApplicationStatus;
  submittedDate?: string | Date | null;
  notes?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  bidder?: { email: string; fullName: string; resumeUrl?: string | null } | null;
}): Application {
  const submittedAt = app.submittedDate ?? app.createdAt;
  const company = app.company.trim();
  return {
    id: app.id,
    bidderId: app.bidderId,
    bidderName: app.bidder?.fullName ?? app.bidder?.email ?? app.bidderId,
    jobTitle: app.jobTitle,
    company,
    jobUrl: app.jobUrl ?? undefined,
    jobDescription: app.jobDescription,
    resumeUrl: app.resumeUrl ?? app.bidder?.resumeUrl ?? undefined,
    status: app.status,
    submittedDate: new Date(submittedAt).toISOString(),
    notes: app.notes ?? undefined,
    salaryMin: app.salaryMin ?? undefined,
    salaryMax: app.salaryMax ?? undefined,
    createdAt: new Date(app.createdAt).toISOString(),
    updatedAt: new Date(app.updatedAt).toISOString(),
    location: "Remote",
    source: "Manual entry",
    url: app.jobUrl ?? undefined,
    appliedAt: new Date(submittedAt).toISOString(),
  };
}

function mapPayment(payment: {
  id: string;
  bidderId: string;
  managerId: string;
  amount: number;
  paymentDate: string | Date;
  notes?: string | null;
  createdAt: string | Date;
  bidder?: { fullName: string; email: string } | null;
  manager?: { username: string } | null;
}): Payment {
  return {
    id: payment.id,
    bidderId: payment.bidderId,
    bidderName: payment.bidder?.fullName ?? payment.bidder?.email ?? payment.bidderId,
    applicationId: payment.id,
    amount: payment.amount,
    currency: "USD",
    status: "paid",
    createdAt: new Date(payment.createdAt).toISOString(),
    paymentDate: new Date(payment.paymentDate).toISOString(),
    notes: payment.notes ?? undefined,
    managerId: payment.managerId,
  };
}

function mapAuditLog(log: {
  id: string;
  userId: string;
  action: string;
  details: unknown;
  createdAt: string | Date;
  user?: { username: string; role: Role; isApproved: boolean; bidder?: { fullName: string } | null } | null;
}): AuditLog {
  return {
    id: log.id,
    actorId: log.userId,
    actorName: log.user?.bidder?.fullName ?? log.user?.username ?? log.userId,
    action: log.action,
    target: typeof log.details === "object" && log.details && "targetUserId" in log.details
      ? String((log.details as { targetUserId?: string }).targetUserId ?? "")
      : "",
    ip: "-",
    createdAt: new Date(log.createdAt).toISOString(),
    details: log.details,
  };
}

function mapBackgroundJob(job: {
  id: string;
  userId: string;
  type: string;
  status: "queued" | "processing" | "retrying" | "completed" | "failed" | "dead_letter";
  attempts: number;
  maxAttempts: number;
  progress?: number;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  failedAt?: string | Date | null;
  error?: string | null;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  user?: { username: string; role: Role; isApproved: boolean } | null;
}): BackgroundJob {
  const legacyStatus =
    job.status === "processing" || job.status === "retrying"
      ? "running"
      : job.status === "completed"
        ? "succeeded"
        : job.status;

  return {
    id: job.id,
    kind: job.type.replace(/\./g, "_"),
    status: legacyStatus,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    progress: job.progress ?? (job.status === "completed" ? 100 : 0),
    startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : undefined,
    finishedAt: job.completedAt ? new Date(job.completedAt).toISOString() : job.failedAt ? new Date(job.failedAt).toISOString() : undefined,
    error: job.error ?? undefined,
    payload: job.payload ?? undefined,
  };
}

function mapNotification(notification: {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  link?: string | null;
  data?: unknown;
  isRead: boolean;
  createdAt: string | Date;
}): NotificationItem {
  const kind = ["success", "error", "warning"].includes(notification.type)
    ? (notification.type as NotificationItem["type"])
    : "info";

  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    type: kind,
    read: notification.isRead,
    createdAt: new Date(notification.createdAt).toISOString(),
    link: notification.link ?? undefined,
    data: notification.data,
  };
}

function mapResumeTemplate(template: {
  id: string;
  managerId: string;
  title: string;
  fileUrl?: string | null;
  openUrl?: string | null;
  textLength: number;
  createdAt: string | Date;
  updatedAt?: string | Date;
  manager?: {
    id: string;
    username: string;
    managerProfile?: { fullName?: string | null } | null;
  } | null;
}): ResumeTemplate {
  const fileUrl = resolveAssetUrl(template.fileUrl);
  const openUrl = resolveAssetUrl(template.openUrl);

  return {
    id: template.id,
    managerId: template.managerId,
    managerName: template.manager?.managerProfile?.fullName ?? template.manager?.username ?? null,
    title: template.title,
    fileUrl,
    openUrl,
    textLength: template.textLength,
    createdAt: new Date(template.createdAt).toISOString(),
    updatedAt: template.updatedAt ? new Date(template.updatedAt).toISOString() : undefined,
  };
}

function mapApplicationStats(applications: Application[]) {
  const weeks = new Map<string, { week: string; applications: number; interviews: number }>();
  const now = new Date();

  for (let i = 7; i >= 0; i -= 1) {
    const label = `W${8 - i}`;
    weeks.set(label, { week: label, applications: 0, interviews: 0 });
  }

  for (const app of applications) {
    const submitted = new Date(app.submittedDate);
    const weekIndex = Math.max(0, 7 - Math.floor((now.getTime() - submitted.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    const label = `W${Math.min(8, Math.max(1, weekIndex + 1))}`;
    const bucket = weeks.get(label);
    if (!bucket) continue;
    bucket.applications += 1;
    if (app.status === "interviewed") bucket.interviews += 1;
  }

  return Array.from(weeks.values());
}

export const api = {
  async me(): Promise<User> {
    const data = await request<{ user: ApiUserRecord; bidder?: ApiUserRecord["bidder"]; managerProfile?: ApiUserRecord["managerProfile"] }>(
      "/api/auth/me",
      { method: "GET" },
    );
    return mapUser({
      ...data.user,
      bidder: data.bidder ?? data.user.bidder ?? null,
      managerProfile: data.managerProfile ?? data.user.managerProfile ?? null,
    });
  },

  async login(username: string, password: string): Promise<User> {
    const data = await request<{ user: ApiUserRecord; bidder?: ApiUserRecord["bidder"]; managerProfile?: ApiUserRecord["managerProfile"] }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      },
    );

    return mapUser({
      ...data.user,
      bidder: data.bidder ?? data.user.bidder ?? null,
      managerProfile: data.managerProfile ?? data.user.managerProfile ?? null,
    });
  },

  async register(input: { username: string; password: string; role: Role; email?: string; fullName?: string }): Promise<User> {
    const data = await request<{ user: ApiUserRecord; bidder?: ApiUserRecord["bidder"]; managerProfile?: ApiUserRecord["managerProfile"]; pendingApproval?: boolean }>(
      "/api/auth/register",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );

    return mapUser({
      ...data.user,
      bidder: data.bidder ?? data.user.bidder ?? null,
      managerProfile: data.managerProfile ?? data.user.managerProfile ?? null,
    });
  },

  async logout(): Promise<void> {
    await request("/api/auth/logout", { method: "POST" });
  },

  async refresh(): Promise<User> {
    const data = await request<{ user: ApiUserRecord; bidder?: ApiUserRecord["bidder"]; managerProfile?: ApiUserRecord["managerProfile"] }>(
      "/api/auth/refresh",
      { method: "POST" },
    );
    return mapUser({
      ...data.user,
      bidder: data.bidder ?? data.user.bidder ?? null,
      managerProfile: data.managerProfile ?? data.user.managerProfile ?? null,
    });
  },

  async listApplications(filter?: {
    bidderId?: string;
    q?: string;
    status?: string;
  }): Promise<Application[]> {
    const params = new URLSearchParams();
    params.set("limit", "100");
    params.set("page", "1");
    if (filter?.bidderId) params.set("bidderId", filter.bidderId);
    if (filter?.q) params.set("q", filter.q);
    if (filter?.status && filter.status !== "all") params.set("status", filter.status);

    const data = await request<{ items: Array<Parameters<typeof mapApplication>[0]> }>(
      `/api/applications?${params.toString()}`,
      { method: "GET" },
    );

    return data.items.map(mapApplication);
  },

  async getApplication(id: string): Promise<Application | undefined> {
    try {
      const data = await request<Parameters<typeof mapApplication>[0]>(
        `/api/applications/${id}`,
        { method: "GET" },
      );
      return mapApplication(data);
    } catch {
      return undefined;
    }
  },

  async createApplication(input: {
    jobTitle: string;
    company: string;
    jobUrl?: string;
    jobDescription: string;
    resumeUrl?: string;
    notes?: string;
    salaryMin?: number;
    salaryMax?: number;
  }): Promise<Application> {
    const data = await request<Parameters<typeof mapApplication>[0]>(
      "/api/applications",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );

    return mapApplication(data);
  },

  async uploadResume(file: File): Promise<{
    resumeUrl: string;
    resumeText?: string;
    extractionWarning?: string | null;
    file: { fileName: string; mimeType: string; url: string };
  }> {
    const formData = new FormData();
    formData.append("file", file);

    return request<{
      resumeUrl: string;
      resumeText?: string;
      extractionWarning?: string | null;
      file: { fileName: string; mimeType: string; url: string };
    }>(
      "/api/uploads/resume",
      {
        method: "POST",
        body: formData,
      },
    );
  },

  async updateApplication(
    id: string,
    patch: Partial<{
      jobTitle: string;
      company: string;
      jobUrl?: string;
      jobDescription: string;
      resumeUrl?: string;
      notes?: string;
      salaryMin?: number;
      salaryMax?: number;
      status: ApplicationStatus;
    }>,
  ): Promise<Application> {
    const data = await request<Parameters<typeof mapApplication>[0]>(
      `/api/applications/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(patch),
      },
    );
    return mapApplication(data);
  },

  async deleteApplication(id: string): Promise<void> {
    await request(`/api/applications/${id}`, { method: "DELETE" });
  },

  async listPayments(): Promise<Payment[]> {
    const data = await request<{ payments: Parameters<typeof mapPayment>[0][] }>(
      "/api/payments/report?limit=100&page=1",
      { method: "GET" },
    );
    return data.payments.map(mapPayment);
  },

  async paymentsReport(): Promise<{ total: number; paid: number; pending: number; failed: number }> {
    const data = await request<{ summary?: { totalAmount: number } }>(
      "/api/payments/report?limit=1&page=1",
      { method: "GET" },
    );
    const total = data.summary?.totalAmount ?? 0;
    return {
      total,
      paid: total,
      pending: 0,
      failed: 0,
    };
  },

  async createPayment(input: {
    bidderId: string;
    amount: number;
    paymentDate?: string;
    notes?: string;
  }): Promise<Payment> {
    const data = await request<Parameters<typeof mapPayment>[0]>(
      "/api/payments",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    return mapPayment(data);
  },

  async bidderStats(): Promise<{
    totals: { applications: number; interviews: number; offers: number; rejected: number };
    weekly: { week: string; applications: number; interviews: number }[];
  }> {
    const [applications, serverStats] = await Promise.all([
      api.listApplications(),
      request<{
        applicationsByStatus: { status: string; count: number }[];
        paymentSummary: { totalAmount: number; count: number };
        bidderCount: number;
      }>("/api/analytics/bidder-stats", { method: "GET" }).catch(() => null),
    ]);

    const byStatus = serverStats?.applicationsByStatus ?? [];
    const count = (s: string) => byStatus.find((x) => x.status === s)?.count ?? applications.filter((a) => a.status === s).length;

    return {
      totals: {
        applications: byStatus.reduce((sum, x) => sum + x.count, 0) || applications.length,
        interviews: count("interviewed"),
        offers: count("hired"),
        rejected: count("rejected"),
      },
      weekly: mapApplicationStats(applications),
    };
  },

  async pendingUsers(): Promise<User[]> {
    const data = await request<{ items: Array<Parameters<typeof mapUser>[0]> }>(
      "/api/admin/pending-users",
      { method: "GET" },
    );
    return data.items.map((user) =>
      mapUser({
        ...user,
        bidder: user.bidder ?? null,
        managerProfile: user.managerProfile ?? null,
      }),
    );
  },

  async approveUser(id: string): Promise<User> {
    const data = await request<{ user: Parameters<typeof mapUser>[0] }>(
      `/api/admin/approve/${id}`,
      { method: "PUT" },
    );
    return mapUser({
      ...data.user,
      bidder: data.user.bidder ?? null,
      managerProfile: data.user.managerProfile ?? null,
    });
  },

  async listUsers(): Promise<User[]> {
    const data = await request<{ items: Array<Parameters<typeof mapUser>[0]> }>(
      "/api/admin/users?limit=100&page=1",
      { method: "GET" },
    );
    return data.items.map((user) =>
      mapUser({
        ...user,
        bidder: user.bidder ?? null,
        managerProfile: user.managerProfile ?? null,
      }),
    );
  },

  async createManager(input: {
    username: string;
    password: string;
    fullName: string;
    email: string;
    template: File;
    isApproved?: boolean;
  }): Promise<User> {
    const formData = new FormData();
    formData.append("username", input.username);
    formData.append("password", input.password);
    formData.append("fullName", input.fullName);
    formData.append("email", input.email);
    formData.append("isApproved", input.isApproved === false ? "false" : "true");
    formData.append("template", input.template);

    const data = await request<{ user: Parameters<typeof mapUser>[0]; managerProfile?: Parameters<typeof mapUser>[0]["managerProfile"] }>(
      "/api/admin/managers",
      {
        method: "POST",
        body: formData,
      },
    );

    return mapUser({
      ...data.user,
      bidder: data.user.bidder ?? null,
      managerProfile: data.managerProfile ?? data.user.managerProfile ?? null,
    });
  },

  async uploadManagerTemplate(managerId: string, template: File): Promise<User> {
    const formData = new FormData();
    formData.append("template", template);

    const data = await request<{ user: Parameters<typeof mapUser>[0]; managerProfile?: Parameters<typeof mapUser>[0]["managerProfile"] }>(
      `/api/admin/managers/${managerId}/template`,
      {
        method: "PATCH",
        body: formData,
      },
    );

    return mapUser({
      ...data.user,
      bidder: data.user.bidder ?? null,
      managerProfile: data.managerProfile ?? data.user.managerProfile ?? null,
    });
  },

  async uploadResumeTemplate(input: {
    managerId: string;
    title: string;
    file?: File;
    originalText?: string;
  }): Promise<ResumeTemplate> {
    const formData = new FormData();
    formData.append("managerId", input.managerId);
    formData.append("title", input.title);
    if (input.file) {
      formData.append("file", input.file);
    }
    if (input.originalText) {
      formData.append("originalText", input.originalText);
    }

    const data = await request<{
      resume: {
        id: string;
        managerId: string;
        title: string;
        fileUrl?: string | null;
        textLength: number;
        createdAt: string | Date;
        updatedAt?: string | Date;
      };
    }>("/api/resumes/upload", {
      method: "POST",
      body: formData,
    });

    return mapResumeTemplate(data.resume);
  },

  async listResumes(filter?: { managerId?: string }): Promise<ResumeTemplate[]> {
    const params = new URLSearchParams();
    params.set("limit", "100");
    params.set("page", "1");
    if (filter?.managerId) {
      params.set("managerId", filter.managerId);
    }

    const data = await request<{
      items: Array<{
        id: string;
        managerId: string;
        title: string;
        fileUrl?: string | null;
        openUrl?: string | null;
        textLength: number;
        createdAt: string | Date;
        updatedAt?: string | Date;
        manager?: {
          id: string;
          username: string;
          managerProfile?: { fullName?: string | null } | null;
        } | null;
      }>;
    }>(`/api/resumes?${params.toString()}`, { method: "GET" });

    return data.items.map(mapResumeTemplate);
  },

  async deleteResume(resumeId: string): Promise<void> {
    await request(`/api/admin/resumes/${resumeId}`, { method: "DELETE" });
  },

  async deleteLatestManagerResume(managerId: string): Promise<void> {
    const resumes = await api.listResumes({ managerId });
    if (resumes.length === 0) {
      throw new Error("No resume template found for this manager");
    }

    await api.deleteResume(resumes[0].id);
  },

  async listBidders(): Promise<User[]> {
    const data = await request<{ items: Array<Parameters<typeof mapUser>[0]> }>(
      "/api/manager/bidders",
      { method: "GET" },
    );
    return data.items.map((user) =>
      mapUser({
        ...user,
        bidder: user.bidder ?? null,
        managerProfile: user.managerProfile ?? null,
      }),
    );
  },

  async updateUser(
    id: string,
    patch: Partial<{ role: Role; isApproved: boolean; email: string; fullName: string; managerId: string | null }>,
  ): Promise<User> {
    const data = await request<{ user: Parameters<typeof mapUser>[0] }>(
      `/api/admin/users/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      },
    );
    return mapUser({
      ...data.user,
      bidder: data.user.bidder ?? null,
      managerProfile: data.user.managerProfile ?? null,
    });
  },

  async auditLogs(): Promise<AuditLog[]> {
    const data = await request<{ items: Array<Parameters<typeof mapAuditLog>[0]> }>(
      "/api/admin/audit-logs?limit=100&page=1",
      { method: "GET" },
    );
    return data.items.map(mapAuditLog);
  },

  async listJobs(): Promise<BackgroundJob[]> {
    const data = await request<{ items: Array<Parameters<typeof mapBackgroundJob>[0]> }>(
      "/api/admin/jobs?limit=100&page=1",
      { method: "GET" },
    );
    return data.items.map(mapBackgroundJob);
  },

  async getJob(id: string): Promise<BackgroundJob | undefined> {
    const jobs = await api.listJobs();
    return jobs.find((job) => job.id === id);
  },

  async retryJob(id: string): Promise<BackgroundJob> {
    const data = await request<{ job: Parameters<typeof mapBackgroundJob>[0] }>(
      `/api/admin/jobs/${id}/retry`,
      { method: "POST" },
    );
    return mapBackgroundJob(data.job);
  },

  async retryDeadLetterResumes(): Promise<number> {
    const data = await request<{ retriedCount: number }>(
      "/api/admin/jobs/retry-dead-letter-resume",
      { method: "POST" },
    );
    return data.retriedCount;
  },

  async listNotifications(): Promise<NotificationItem[]> {
    const data = await request<{ items: Array<Parameters<typeof mapNotification>[0]> }>(
      "/api/notifications?limit=100&page=1",
      { method: "GET" },
    );
    return data.items.map(mapNotification);
  },

  async markNotificationRead(id: string): Promise<void> {
    await request(`/api/notifications/${id}`, { method: "PATCH" });
  },

  async markAllNotificationsRead(): Promise<void> {
    await request("/api/notifications", { method: "PATCH" });
  },

  async generateResume(input: {
    resumeId?: string;
    jobTitle: string;
    company: string;
    jobDescription: string;
    preferInline?: boolean;
  }): Promise<{
    jobId: string;
    status: "queued" | "completed";
    preview?: string;
    message?: string;
  }> {
    const data = await request<{
      jobId: string;
      status: "queued" | "completed";
      message?: string;
      preview?: string;
      resumeMarkdown?: string;
      coverLetterMarkdown?: string;
      result?: { preview?: string; markdown?: string; content?: string };
    }>(
      "/api/ai/generate-resume",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );

    const preview =
      extractResumePreview(data.preview) ||
      extractResumePreview(data.resumeMarkdown) ||
      extractResumePreview(data.result) ||
      extractResumePreview(data);
    return {
      jobId: data.jobId,
      status: data.status,
      preview,
      message: data.message,
    };
  },
};

