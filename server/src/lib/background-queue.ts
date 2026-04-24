import IORedis from "ioredis";
import { Queue } from "bullmq";
import { Prisma } from "@prisma/client";
import { createBackgroundJob } from "./background-jobs";

export const BACKGROUND_QUEUE_NAME = "background-jobs";

let queue: Queue | null = null;
let queueConnection: IORedis | null = null;

export function isBackgroundQueueEnabled() {
  return Boolean(process.env.REDIS_URL);
}

export function createBullmqConnection() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for the background queue");
  }

  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true
  });
}

function getQueueConnection() {
  if (!queueConnection) {
    queueConnection = createBullmqConnection();
  }

  return queueConnection;
}

function getQueue() {
  if (!queue) {
    queue = new Queue(BACKGROUND_QUEUE_NAME, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000
        },
        removeOnComplete: {
          age: 60 * 60 * 24,
          count: 1000
        },
        removeOnFail: {
          age: 60 * 60 * 24 * 7,
          count: 1000
        }
      }
    });
  }

  return queue;
}

export type BackgroundQueueRecord = {
  id: string;
  userId: string;
  type: string;
  payload: Prisma.InputJsonValue;
  attempts?: number;
};

function getQueueJobId(backgroundJobId: string) {
  return `${backgroundJobId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export async function enqueueResumeGenerationJob(input: {
  jobId: string;
  userId: string;
  payload: {
    resumeId: string;
    jobTitle: string;
    company: string;
    jobDescription: string;
    resumeText?: string;
    resumeUrl?: string;
    candidateName?: string;
  };
  baseAttempts?: number;
}) {
  if (!isBackgroundQueueEnabled()) {
    return null;
  }

  return getQueue().add(
    "resume.generate",
    {
      ...input,
      baseAttempts: input.baseAttempts ?? 0
    },
    {
      jobId: getQueueJobId(input.jobId)
    }
  );
}

export async function enqueueNotificationJob(input: {
  userIds: string[];
  notification: {
    type: string;
    title: string;
    body: string;
    link?: string | null;
    data?: Prisma.InputJsonValue;
  };
}) {
  if (!isBackgroundQueueEnabled()) {
    return null;
  }

  const ownerUserId = input.userIds[0];
  if (!ownerUserId) {
    throw new Error("notification jobs require at least one recipient");
  }

  const backgroundJob = await createBackgroundJob({
    userId: ownerUserId,
    type: "notification.create",
    payload: {
      userIds: input.userIds,
      notification: input.notification
    }
  });

  return getQueue().add(
    "notification.create",
    {
      backgroundJobId: backgroundJob.id,
      userIds: input.userIds,
      notification: input.notification,
      baseAttempts: 0
    },
    {
      jobId: getQueueJobId(backgroundJob.id)
    }
  );
}

export async function enqueueBackgroundJobRetry(backgroundJob: BackgroundQueueRecord) {
  if (!isBackgroundQueueEnabled()) {
    return null;
  }

  if (backgroundJob.type === "resume.generate") {
    return getQueue().add(
      "resume.generate",
      {
        jobId: backgroundJob.id,
        userId: backgroundJob.userId,
        payload: backgroundJob.payload,
        baseAttempts: backgroundJob.attempts ?? 0
      },
      {
        jobId: getQueueJobId(backgroundJob.id)
      }
    );
  }

  if (backgroundJob.type === "notification.create") {
    const payload = backgroundJob.payload as {
      userIds: string[];
      notification: {
        type: string;
        title: string;
        body: string;
        link?: string | null;
        data?: Prisma.InputJsonValue;
      };
    };

    return getQueue().add(
      "notification.create",
      {
        backgroundJobId: backgroundJob.id,
        userIds: payload.userIds,
        notification: payload.notification,
        baseAttempts: backgroundJob.attempts ?? 0
      },
      {
        jobId: getQueueJobId(backgroundJob.id)
      }
    );
  }

  throw new Error(`Unsupported background job type: ${backgroundJob.type}`);
}

export async function closeBackgroundQueue() {
  await queue?.close();
  queue = null;

  await queueConnection?.quit();
  queueConnection = null;
}
