import { prisma } from "./prisma";
import { readAuthToken, verifyAuthToken } from "./jwt";
import type { NextRequest } from "next/server";
import type { UserRole } from "@prisma/client";
import { getSessionByAccessToken } from "./session";

export async function getAuthUser(req: NextRequest) {
  const token = readAuthToken(req);
  if (!token) {
    return null;
  }

  try {
    const payload = await verifyAuthToken(token);
    if (!payload.sid) {
      return null;
    }

    const session = await getSessionByAccessToken(payload.sid);
    if (!session) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        role: true,
        isApproved: true,
        createdAt: true,
        updatedAt: true,
        bidder: {
          select: {
            id: true,
            email: true,
            fullName: true,
            resumeUrl: true,
            totalPaid: true,
            managerId: true,
            manager: {
              select: {
                id: true,
                username: true,
                role: true,
                isApproved: true,
                managerProfile: {
                  select: {
                    fullName: true,
                    templateResumeUrl: true,
                    templateResumeText: true
                  }
                }
              }
            }
          }
        },
        managerProfile: {
          select: {
            email: true,
            fullName: true,
            templateResumeUrl: true
          }
        }
      }
    });

    if (!user) {
      return null;
    }

    if (!user.isApproved) {
      return null;
    }

    return { payload, user, session };
  } catch {
    return null;
  }
}

export function hasRole(role: UserRole, allowed: UserRole[]) {
  return allowed.includes(role);
}
