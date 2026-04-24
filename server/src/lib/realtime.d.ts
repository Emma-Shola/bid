import type { UserRole } from "@prisma/client";

export type RealtimeUser = {
  id: string;
  username: string;
  role: UserRole;
  isApproved: boolean;
};

export type RealtimeAudience = {
  roles?: UserRole[];
  userIds?: string[];
  excludeUserIds?: string[];
};

export function registerRealtimeSocket(socket: {
  readyState?: number;
  send(message: string): void;
  __zaaaUser?: RealtimeUser;
}, user: RealtimeUser): void;

export function unregisterRealtimeSocket(socket: {
  __zaaaUser?: RealtimeUser;
}): void;

export function publishEvent(
  type: string,
  data?: unknown,
  audience?: RealtimeAudience
): void;

