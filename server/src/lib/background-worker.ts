import { Worker } from "bullmq";
import { Prisma, UserRole } from "@prisma/client";
import { BACKGROUND_QUEUE_NAME, createBullmqConnection, enqueueNotificationJob } from "./background-queue";
import { prisma } from "./prisma";
import { generateResumeContent } from "./openai";
import { createGeneratedResumeRecord } from "./resume/persistence";
import { publishEvent } from "./realtime.js";
import {
  markBackgroundJobCompleted,
  markBackgroundJobDeadLetter,
  markBackgroundJobProcessing,
  markBackgroundJobQaRequired,
  markBackgroundJobRetrying
} from "./background-jobs";
import { getBackofficeRecipientIds, persistNotifications } from "./notifications";

type ResumeGenerationJobData = {
  jobId: string;
  userId: string;
  baseAttempts?: number;
  payload: {
    resumeId: string;
    jobTitle: string;
    company: string;
    jobDescription: string;
    resumeText?: string;
    resumeUrl?: string;
    candidateName?: string;
  };
};

type NotificationJobData = {
  backgroundJobId: string;
  baseAttempts?: number;
  userIds: string[];
  notification: {
    type: string;
    title: string;
    body: string;
    link?: string | null;
    data?: Prisma.InputJsonValue;
  };
};

function isResumeGenerationJob(data: unknown): data is ResumeGenerationJobData {
  return Boolean(
    data &&
      typeof data === "object" &&
      "jobId" in data &&
      "userId" in data &&
      "payload" in data
  );
}

function isNotificationJob(data: unknown): data is NotificationJobData {
  return Boolean(
    data &&
      typeof data === "object" &&
      "backgroundJobId" in data &&
      "userIds" in data &&
      "notification" in data
  );
}

function getBackgroundJobId(job: import("bullmq").Job) {
  const data = job.data as { backgroundJobId?: string; jobId?: string } | undefined;
  return data?.backgroundJobId ?? data?.jobId ?? String(job.id ?? "");
}

function getCurrentAttempts(job: import("bullmq").Job, baseAttempts = 0) {
  return baseAttempts + job.attemptsMade + 1;
}

async function handleResumeGeneration(job: import("bullmq").Job) {
  const data = job.data as ResumeGenerationJobData;
  if (!isResumeGenerationJob(data)) {
    throw new Error("Invalid resume generation job payload");
  }

  await markBackgroundJobProcessing(data.jobId, getCurrentAttempts(job, data.baseAttempts ?? 0));

  const result = await generateResumeContent(data.payload);
  const { cache, ...publicResult } = result;
  const generatedResumeId =
    cache.hit && cache.recordId
      ? cache.recordId
      : (
          await createGeneratedResumeRecord({
            resumeId: data.payload.resumeId,
            bidderId: data.userId,
            jobTitle: data.payload.jobTitle,
            company: data.payload.company,
            jobDescription: data.payload.jobDescription,
            cacheFingerprint: cache.fingerprint,
            modelName: cache.modelName,
            promptVersion: cache.promptVersion,
            result
          })
        ).id;

  const requiresQa = !result.validation.ok;

  await prisma.auditLog.create({
    data: {
      userId: data.userId,
      action: "resume.generated",
      details: {
        resumeId: data.payload.resumeId,
        generatedResumeId,
        backgroundJobId: data.jobId,
        jobTitle: data.payload.jobTitle,
        company: data.payload.company
      }
    }
  });

  const terminalResult = {
    ...publicResult,
    meta: {
      resumeId: data.payload.resumeId,
      generatedResumeId,
      jobTitle: data.payload.jobTitle,
      company: data.payload.company
    }
  };

  console.log(
    `[background-worker] resume.generate finished job=${data.jobId} userId=${data.userId} requiresQa=${requiresQa} generatedResumeId=${generatedResumeId}`
  );

  // markBackgroundJobQaRequired/markBackgroundJobCompleted already publish a
  // correctly-shaped { job } event to both admins and the owning bidder
  // (see background-jobs.ts). A second, differently-shaped event used to be
  // published here too, admin-only and without a `job` wrapper, so the
  // bidder's client-side listener (which checks for `event.data.job`) always
  // ignored it — it was dead weight and has been removed.
  if (requiresQa) {
    await markBackgroundJobQaRequired(data.jobId, terminalResult);
  } else {
    await markBackgroundJobCompleted(data.jobId, terminalResult);
  }

  await enqueueNotificationJob({
    userIds: [data.userId],
    notification: {
      type: requiresQa ? "resume.qa_required" : "resume.generated",
      title: requiresQa ? "Resume needs review" : "Resume generated",
      body: requiresQa
        ? `A tailored resume was generated for ${data.payload.jobTitle} at ${data.payload.company}, but it needs QA review before download.`
        : `A tailored resume was generated for ${data.payload.jobTitle} at ${data.payload.company}.`,
      link: `/api/jobs/${data.jobId}`,
      data: {
        resumeId: data.payload.resumeId,
        generatedResumeId,
        backgroundJobId: data.jobId,
        jobTitle: data.payload.jobTitle,
        company: data.payload.company,
        requiresQa
      }
    }
  }).catch((error) => {
    console.warn("failed to enqueue resume completion notification", error);
    return null;
  });

  return {
    ok: true,
    jobId: data.jobId
  };
}

async function handleNotification(job: import("bullmq").Job) {
  const data = job.data as NotificationJobData;
  if (!isNotificationJob(data)) {
    throw new Error("Invalid notification job payload");
  }

  await markBackgroundJobProcessing(data.backgroundJobId, getCurrentAttempts(job, data.baseAttempts ?? 0));

  const notifications = await persistNotifications(data.userIds, data.notification);

  await markBackgroundJobCompleted(data.backgroundJobId, {
    ok: true,
    count: notifications.length
  });

  void publishEvent(
    "background-job.updated",
    {
      jobId: data.backgroundJobId,
      type: "notification.create",
      status: "completed",
      attempts: getCurrentAttempts(job, data.baseAttempts ?? 0),
      userIds: data.userIds
    },
    {
      roles: [UserRole.admin]
    }
  );

  return {
    ok: true,
    count: notifications.length
  };
}

export function createBackgroundWorker() {
  const worker = new Worker(
    BACKGROUND_QUEUE_NAME,
    async (job) => {
      if (job.name === "resume.generate") {
        return handleResumeGeneration(job);
      }

      if (job.name === "notification.create") {
        return handleNotification(job);
      }

      throw new Error(`Unsupported background job: ${job.name}`);
    },
    {
      connection: createBullmqConnection(),
      concurrency: 3
    }
  );

  worker.on("failed", async (job, error) => {
    if (!job) {
      return;
    }

    const backgroundJobId = getBackgroundJobId(job);
    if (!backgroundJobId) {
      return;
    }

    const baseAttempts = (job.data as { baseAttempts?: number } | undefined)?.baseAttempts ?? 0;
    const queueAttempt = job.attemptsMade + 1;
    const attempts = baseAttempts + queueAttempt;
    const maxAttempts = job.opts.attempts ?? 1;
    const isDeadLetter = queueAttempt >= maxAttempts;

    if (isDeadLetter) {
      await markBackgroundJobDeadLetter(backgroundJobId, error, attempts).catch((markError) => {
        console.warn("failed to mark dead-letter job", markError);
      });

      const adminIds = await getBackofficeRecipientIds().catch(() => []);
      if (adminIds.length > 0) {
        const failureLabel =
          job.name === "resume.generate"
            ? "resume generation"
            : job.name === "notification.create"
              ? "notification delivery"
              : job.name;

        await persistNotifications(adminIds, {
          type: "job.dead_letter",
          title: `${failureLabel} failed`,
          body: `The ${failureLabel} job moved to dead-letter after ${attempts} attempts.`,
          link: `/api/jobs/${backgroundJobId}`,
          data: {
            backgroundJobId,
            jobName: job.name,
            attempts,
            error: error instanceof Error ? error.message : String(error)
          }
        }).catch((notifyError) => {
          console.warn("failed to create dead-letter admin notification", notifyError);
        });
      }

      return;
    }

    console.log(`[background-worker] job=${backgroundJobId} attempt=${attempts}/${maxAttempts} failed, retrying: ${error instanceof Error ? error.message : String(error)}`);

    // markBackgroundJobRetrying already publishes a correctly-shaped { job }
    // event to admins and the owning bidder (background-jobs.ts). The
    // separate admin-only, wrongly-shaped event that used to be published
    // here was dead weight for the same reason as the one removed above.
    await markBackgroundJobRetrying(backgroundJobId, error, attempts).catch((markError) => {
      console.warn("failed to mark retrying job", markError);
    });
  });

  return worker;
}
