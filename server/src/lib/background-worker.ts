import { Worker } from "bullmq";
import { Prisma, UserRole } from "@prisma/client";
import { BACKGROUND_QUEUE_NAME, createBullmqConnection, enqueueNotificationJob } from "./background-queue";
import { prisma } from "./prisma";
import { generateResumeContent } from "./openai";
import { publishEvent } from "./realtime.js";
import {
  markBackgroundJobCompleted,
  markBackgroundJobDeadLetter,
  markBackgroundJobProcessing,
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
  const data = job.data as
    | { backgroundJobId?: string; jobId?: string }
    | undefined;

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

  const generated = await prisma.generatedResume.create({
    data: {
      resumeId: data.payload.resumeId,
      bidderId: data.userId,
      jobTitle: data.payload.jobTitle,
      company: data.payload.company,
      jobDescription: data.payload.jobDescription,
      outputText: result.resumeMarkdown
    },
    select: {
      id: true
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: data.userId,
      action: "resume.generated",
      details: {
        resumeId: data.payload.resumeId,
        generatedResumeId: generated.id,
        backgroundJobId: data.jobId,
        jobTitle: data.payload.jobTitle,
        company: data.payload.company
      }
    }
  });

  await markBackgroundJobCompleted(data.jobId, {
    ...result,
    meta: {
      resumeId: data.payload.resumeId,
      generatedResumeId: generated.id,
      jobTitle: data.payload.jobTitle,
      company: data.payload.company
    }
  });

  void publishEvent(
    "background-job.updated",
    {
      jobId: data.jobId,
      type: "resume.generate",
      status: "completed",
      attempts: getCurrentAttempts(job, data.baseAttempts ?? 0),
      userId: data.userId
    },
    {
      roles: [UserRole.admin]
    }
  );

  await enqueueNotificationJob({
    userIds: [data.userId],
    notification: {
      type: "resume.generated",
      title: "Resume generated",
      body: `A tailored resume was generated for ${data.payload.jobTitle} at ${data.payload.company}.`,
      link: `/api/jobs/${data.jobId}`,
      data: {
        resumeId: data.payload.resumeId,
        generatedResumeId: generated.id,
        backgroundJobId: data.jobId,
        jobTitle: data.payload.jobTitle,
        company: data.payload.company
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
      concurrency: 5
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

    await markBackgroundJobRetrying(backgroundJobId, error, attempts).catch((markError) => {
      console.warn("failed to mark retrying job", markError);
    });

    void publishEvent(
      "background-job.updated",
      {
        jobId: backgroundJobId,
        type: job.name,
        status: "retrying",
        attempts,
        error: error instanceof Error ? error.message : String(error)
      },
      {
        roles: [UserRole.admin]
      }
    );
  });

  return worker;
}
