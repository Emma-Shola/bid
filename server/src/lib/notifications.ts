import { prisma } from "./prisma";
import { Prisma, UserRole } from "@prisma/client";
import { publishEvent } from "./realtime.js";
import { enqueueNotificationJob, isBackgroundQueueEnabled } from "./background-queue";

export async function persistNotifications(
  userIds: string[],
  input: {
    type: string;
    title: string;
    body: string;
    link?: string | null;
    data?: Prisma.InputJsonValue;
  }
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return [];
  }

  const notifications = await prisma.$transaction(
    uniqueUserIds.map((userId) =>
      prisma.notification.create({
        data: {
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          link: input.link ?? null,
          data: input.data ?? null
        }
      })
    )
  );

  for (const notification of notifications) {
    void publishEvent(
      "notification.created",
      { notification },
      {
        userIds: [notification.userId]
      }
    );
  }

  return notifications;
}

export async function createNotifications(
  userIds: string[],
  input: {
    type: string;
    title: string;
    body: string;
    link?: string | null;
    data?: Prisma.InputJsonValue;
  }
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return [];
  }

  if (isBackgroundQueueEnabled()) {
    const job = await enqueueNotificationJob({
      userIds: uniqueUserIds,
      notification: input
    }).catch((error) => {
      console.warn("notification queue enqueue failed, falling back to direct write", error);
      return null;
    });

    if (job) {
      return {
        queued: true,
        jobId: job.id,
        userIds: uniqueUserIds
      };
    }
  }

  return persistNotifications(uniqueUserIds, input);
}

export async function getBackofficeRecipientIds() {
  const users = await prisma.user.findMany({
    where: {
      role: {
        in: [UserRole.manager, UserRole.admin]
      },
      isApproved: true
    },
    select: {
      id: true
    }
  });

  return users.map((user) => user.id);
}

export async function markNotificationAsRead(notificationId: string, userId: string) {
  return prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId
    },
    data: {
      isRead: true,
      readAt: new Date()
    }
  });
}

export async function markAllNotificationsAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: {
      userId,
      isRead: false
    },
    data: {
      isRead: true,
      readAt: new Date()
    }
  });
}
