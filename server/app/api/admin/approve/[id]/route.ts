import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { revokeSessionsByUserId } from "@/lib/session";
import { publishEvent } from "@/lib/realtime";
import { createNotifications } from "@/lib/notifications";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "admin:approve", limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const { id } = context.params;
    const existing = await prisma.user.findUnique({ where: { id } });

    if (!existing) {
      return jsonError("User not found", 404);
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isApproved: true },
      select: {
        id: true,
        username: true,
        role: true,
        isApproved: true,
        createdAt: true,
        updatedAt: true,
        bidder: {
          include: {
            manager: {
              select: {
                id: true,
                username: true,
                managerProfile: {
                  select: {
                    fullName: true
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
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "user.approved",
        details: { approvedUserId: user.id, approvedRole: user.role }
      }
    });

    await revokeSessionsByUserId(user.id);

    await createNotifications([user.id], {
      type: "user.approved",
      title: "Account approved",
      body: "Your account has been approved. You can now sign in.",
      link: "/login",
      data: {
        approvedUserId: user.id,
        approvedRole: user.role
      }
    });

    publishEvent(
      "user.approved",
      { user: { id: user.id, username: user.username, role: user.role, isApproved: user.isApproved } },
      {
        roles: [UserRole.admin],
        userIds: [user.id]
      }
    );

    return jsonOk({ user });
  } catch (error) {
    console.error("approve user PUT failed", error);
    return jsonError("Failed to approve user", 500);
  }
}
