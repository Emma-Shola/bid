import type { UserRole } from "@prisma/client";

export type AuthTokenPayload = {
  sub: string;
  sid: string;
  username: string;
  role: UserRole;
  isApproved: boolean;
};

export type ApiUser = {
  id: string;
  username: string;
  role: UserRole;
  isApproved: boolean;
};
