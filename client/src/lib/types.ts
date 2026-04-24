export type Role = "bidder" | "manager" | "admin";

export type AccountStatus = "pending" | "active" | "suspended";

export interface User {
  id: string;
  email: string;
  name: string;
  username?: string;
  fullName?: string;
  role: Role;
  status: AccountStatus;
  isApproved?: boolean;
  createdAt: string;
  updatedAt?: string;
  resumeUrl?: string | null;
  templateResumeUrl?: string | null;
  managerId?: string | null;
  managerName?: string | null;
  totalPaid?: number;
}

export type ApplicationStatus =
  | "submitted"
  | "reviewed"
  | "interviewed"
  | "rejected"
  | "hired";

export interface Application {
  id: string;
  bidderId: string;
  bidderName: string;
  jobTitle: string;
  company: string;
  jobUrl?: string;
  jobDescription: string;
  resumeUrl?: string;
  status: ApplicationStatus;
  submittedDate?: string;
  notes?: string;
  updatedAt: string;
  createdAt?: string;
  salaryMin?: number;
  salaryMax?: number;
  location?: string;
  source?: string;
  url?: string;
  appliedAt?: string;
  payout?: number;
}

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export interface Payment {
  id: string;
  bidderId: string;
  bidderName: string;
  amount: number;
  currency: "USD";
  status: PaymentStatus;
  createdAt: string;
  paymentDate?: string;
  notes?: string;
  managerId?: string;
  applicationId?: string;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "dead_letter" | "processing" | "retrying" | "completed";
export type JobKind = string;

export interface BackgroundJob {
  id: string;
  kind: JobKind;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  progress: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  target: string;
  ip: string;
  createdAt: string;
  details?: unknown;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
  createdAt: string;
  link?: string;
  data?: unknown;
}

export interface ResumeTemplate {
  id: string;
  managerId: string;
  managerName?: string | null;
  title: string;
  fileUrl?: string | null;
  openUrl?: string | null;
  textLength: number;
  createdAt: string;
  updatedAt?: string;
}
