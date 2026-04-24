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

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "admin:jobs:retry-all", limit: 10, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    if (!isBackgroundQueueEnabled()) {
      return jsonError("Background queue is not available", 503);
    }

    const deadLetterJobs = await prisma.backgroundJob.findMany({
      where: {
        type: "resume.generate",
        status: "dead_letter"
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    const retriedJobs = [];

    for (const backgroundJob of deadLetterJobs) {
      await markBackgroundJobQueued(backgroundJob.id, backgroundJob.attempts);
      const queued = await enqueueBackgroundJobRetry({
        id: backgroundJob.id,
        userId: backgroundJob.userId,
        type: backgroundJob.type,
        payload: backgroundJob.payload as Prisma.InputJsonValue,
        attempts: backgroundJob.attempts
      });
      retriedJobs.push({
        id: backgroundJob.id,
        queuedJobId: queued?.id ?? null
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "background_job.bulk_retry",
        details: {
          scope: "resume.generate.dead_letter",
          retriedCount: retriedJobs.length,
          retriedJobIds: retriedJobs.map((job) => job.id)
        }
      }
    });

    return jsonOk({
      ok: true,
      retriedCount: retriedJobs.length,
      retriedJobs
    });
  } catch (error) {
    console.error("admin jobs bulk retry POST failed", error);
    return jsonError("Failed to retry jobs", 500);
  }
}
