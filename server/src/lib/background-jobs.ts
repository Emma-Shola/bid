import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "./prisma";
import { publishEvent } from "./realtime.js";
import { toPrismaJson } from "./json";

export type BackgroundJobPayload = Prisma.InputJsonValue;

// Background job events must reach both admins (who monitor the queue) and
// the bidder who actually owns the job (whose UI drives auto-download and
// live preview off this same event). Previously every call site here used
// an admin-only audience, so the owning bidder's socket never matched and
// the frontend silently fell back to 10s polling for every status transition.
function jobAudience(job: { id: string; userId: string; status: string }) {
  console.log(`[background-jobs] publishing status=${job.status} job=${job.id} ownerUserId=${job.userId}`);
  return {
    roles: [UserRole.admin],
    userIds: [job.userId]
  };
}

export async function createBackgroundJob(input: {
  userId: string;
  type: string;
  payload: BackgroundJobPayload;
}) {
  const job = await prisma.backgroundJob.create({
    data: {
      userId: input.userId,
      type: input.type,
      status: "queued",
      payload: input.payload
    }
  });

  void publishEvent("background-job.updated", { job }, jobAudience(job));
  return job;
}

export async function updateBackgroundJob(
  jobId: string,
  data: {
    status?: string;
    payload?: BackgroundJobPayload;
    result?: Prisma.InputJsonValue | null;
    error?: string | null;
    attempts?: number;
    completedAt?: Date | null;
    failedAt?: Date | null;
    deadLetterAt?: Date | null;
    deadLetterReason?: string | null;
  }
) {
  return prisma.backgroundJob.update({
    where: {
      id: jobId
    },
    data: {
      ...data,
      ...(data.error === null ? { error: null } : {}),
      ...(data.completedAt === null ? { completedAt: null } : {}),
      ...(data.failedAt === null ? { failedAt: null } : {}),
      ...(data.deadLetterAt === null ? { deadLetterAt: null } : {}),
      ...(data.deadLetterReason === null ? { deadLetterReason: null } : {})
    }
  });
}

export async function getBackgroundJobById(jobId: string) {
  return prisma.backgroundJob.findUnique({
    where: {
      id: jobId
    }
  });
}

export async function markBackgroundJobProcessing(jobId: string, attempts: number) {
  const job = await updateBackgroundJob(jobId, {
    status: "processing",
    attempts,
    error: null,
    failedAt: null,
    completedAt: null
  });

  void publishEvent("background-job.updated", { job }, jobAudience(job));
  return job;
}

export async function markBackgroundJobQueued(jobId: string, attempts: number) {
  const job = await updateBackgroundJob(jobId, {
    status: "queued",
    attempts,
    error: null,
    failedAt: null,
    completedAt: null,
    deadLetterAt: null,
    deadLetterReason: null
  });

  void publishEvent("background-job.updated", { job }, jobAudience(job));
  return job;
}

export async function markBackgroundJobRetrying(jobId: string, error: unknown, attempts: number) {
  const message = error instanceof Error ? error.message : String(error);
  const job = await updateBackgroundJob(jobId, {
    status: "retrying",
    error: message,
    attempts,
    failedAt: null,
    completedAt: null,
    deadLetterAt: null,
    deadLetterReason: null
  });

  void publishEvent("background-job.updated", { job }, jobAudience(job));
  return job;
}

// dbResult is persisted; resumeContent is pushed via WebSocket only (never stored).
export async function markBackgroundJobCompleted(
  jobId: string,
  dbResult: Prisma.InputJsonValue,
  resumeContent?: Prisma.InputJsonValue
) {
  const job = await updateBackgroundJob(jobId, {
    status: "completed",
    result: toPrismaJson(dbResult),
    completedAt: new Date(),
    error: null,
    failedAt: null
  });

  void publishEvent("background-job.updated", { job, ...(resumeContent ? { content: resumeContent } : {}) }, jobAudience(job));
  return job;
}

export async function markBackgroundJobQaRequired(
  jobId: string,
  dbResult: Prisma.InputJsonValue,
  resumeContent?: Prisma.InputJsonValue
) {
  const job = await updateBackgroundJob(jobId, {
    status: "qa_required",
    result: toPrismaJson(dbResult),
    completedAt: new Date(),
    error: null,
    failedAt: null
  });

  void publishEvent("background-job.updated", { job, ...(resumeContent ? { content: resumeContent } : {}) }, jobAudience(job));
  return job;
}

export async function markBackgroundJobFailed(jobId: string, error: unknown, attempts: number) {
  const message = error instanceof Error ? error.message : String(error);
  const job = await updateBackgroundJob(jobId, {
    status: "failed",
    error: message,
    attempts,
    failedAt: new Date()
  });

  void publishEvent("background-job.updated", { job }, jobAudience(job));
  return job;
}

export async function markBackgroundJobDeadLetter(jobId: string, error: unknown, attempts: number) {
  const message = error instanceof Error ? error.message : String(error);
  const job = await updateBackgroundJob(jobId, {
    status: "dead_letter",
    error: message,
    attempts,
    failedAt: new Date(),
    deadLetterAt: new Date(),
    deadLetterReason: message
  });

  void publishEvent("background-job.updated", { job }, jobAudience(job));
  return job;
}
