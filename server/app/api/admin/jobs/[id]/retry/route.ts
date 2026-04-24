import { Prisma, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { enqueueBackgroundJobRetry, isBackgroundQueueEnabled } from "@/lib/background-queue";
import { markBackgroundJobQueued } from "@/lib/background-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "admin:jobs:retry", limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    if (!isBackgroundQueueEnabled()) {
      return jsonError("Background queue is not available", 503);
    }

    const { id } = params;
    const backgroundJob = await prisma.backgroundJob.findUnique({
      where: { id }
    });

    if (!backgroundJob) {
      return jsonError("Job not found", 404);
    }

    if (backgroundJob.status !== "failed" && backgroundJob.status !== "dead_letter") {
      return jsonError("Only failed or dead-letter jobs can be retried", 409);
    }

    await markBackgroundJobQueued(backgroundJob.id, backgroundJob.attempts);

    const job = await enqueueBackgroundJobRetry({
      id: backgroundJob.id,
      userId: backgroundJob.userId,
      type: backgroundJob.type,
      payload: backgroundJob.payload as Prisma.InputJsonValue,
      attempts: backgroundJob.attempts
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "background_job.retry",
        details: {
          backgroundJobId: backgroundJob.id,
          jobType: backgroundJob.type,
          previousStatus: backgroundJob.status,
          queuedJobId: job?.id ?? null
        }
      }
    });

    return jsonOk({
      ok: true,
      job: {
        id: backgroundJob.id,
        status: "queued",
        queuedJobId: job?.id ?? null
      }
    });
  } catch (error) {
    console.error("admin jobs retry POST failed", error);
    return jsonError("Failed to retry job", 500);
  }
}
