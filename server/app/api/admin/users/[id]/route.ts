import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { revokeSessionsByUserId } from "@/lib/session";
import { publishEvent } from "@/lib/realtime";
import { createNotifications } from "@/lib/notifications";
import { adminUserUpdateSchema } from "@/lib/validators";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "admin:users:update", limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const { id } = context.params;
    const body = await req.json().catch(() => null);
    const parsed = adminUserUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("Invalid user payload", 422, parsed.error.flatten());
    }

    const existing = await prisma.user.findUnique({
      where: { id },
      include: {
        bidder: true,
        managerProfile: true
      }
    });

    if (!existing) {
      return jsonError("User not found", 404);
    }

    const nextRole = parsed.data.role ?? existing.role;
    const nextApproved =
      typeof parsed.data.isApproved === "boolean" ? parsed.data.isApproved : existing.isApproved;
    const roleChanged = nextRole !== existing.role;
    const approvalChanged = nextApproved !== existing.isApproved;

    let assignmentManagerId: string | null | undefined = parsed.data.managerId;
    if (nextRole !== UserRole.bidder && typeof parsed.data.managerId !== "undefined") {
      return jsonError("managerId can only be set for bidder accounts", 422);
    }

    if (typeof assignmentManagerId === "string") {
      assignmentManagerId = assignmentManagerId.trim();
      if (!assignmentManagerId) {
        assignmentManagerId = null;
      }
    }

    if (typeof assignmentManagerId === "string") {
      const manager = await prisma.user.findUnique({
        where: { id: assignmentManagerId },
        select: { id: true, role: true }
      });

      if (!manager || manager.role !== UserRole.manager) {
        return jsonError("Assigned manager account was not found", 422);
      }
    }

    const managerChanged =
      typeof assignmentManagerId !== "undefined" &&
      (existing.bidder?.managerId ?? null) !== assignmentManagerId;
    const profileChanged = Boolean(parsed.data.email || parsed.data.fullName);

    const userSelect = {
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
    } as const;

    const managerOnlyUpdate =
      typeof assignmentManagerId !== "undefined" &&
      typeof parsed.data.role === "undefined" &&
      typeof parsed.data.isApproved === "undefined" &&
      typeof parsed.data.email === "undefined" &&
      typeof parsed.data.fullName === "undefined" &&
      nextRole === UserRole.bidder;

    const updated = await prisma.$transaction(async (tx) => {
      if (managerOnlyUpdate) {
        const bidder = await tx.bidderProfile.findUnique({
          where: { id }
        });

        if (!bidder) {
          await tx.bidderProfile.create({
            data: {
              id,
              email: `${existing.username}@example.com`,
              fullName: existing.username,
              managerId: assignmentManagerId ?? null
            }
          });
        } else {
          await tx.bidderProfile.update({
            where: { id },
            data: {
              managerId: assignmentManagerId ?? null
            }
          });
        }

        await tx.auditLog.create({
          data: {
            userId: auth.user.id,
            action: "user.updated",
            details: {
              targetUserId: id,
              role: existing.role,
              isApproved: existing.isApproved,
              managerId: assignmentManagerId ?? null
            }
          }
        });

        return tx.user.findUnique({
          where: { id },
          select: userSelect
        });
      }

      const user = await tx.user.update({
        where: { id },
        data: {
          role: nextRole,
          isApproved: nextApproved
        },
        include: {
          bidder: true,
          managerProfile: true
        }
      });

      if (user.role === UserRole.bidder) {
        if (!user.bidder) {
          await tx.bidderProfile.create({
            data: {
              id: user.id,
              email: parsed.data.email ?? `${user.username}@example.com`,
              fullName: parsed.data.fullName ?? user.username,
              managerId: typeof assignmentManagerId === "undefined" ? null : assignmentManagerId
            }
          });
        } else {
          const bidderUpdateData: {
            email?: string;
            fullName?: string;
            managerId?: string | null;
          } = {};

          if (parsed.data.email) bidderUpdateData.email = parsed.data.email;
          if (parsed.data.fullName) bidderUpdateData.fullName = parsed.data.fullName;
          if (typeof assignmentManagerId !== "undefined") {
            bidderUpdateData.managerId = assignmentManagerId;
          }

          if (Object.keys(bidderUpdateData).length > 0) {
            await tx.bidderProfile.update({
              where: { id: user.id },
              data: bidderUpdateData
            });
          }
        }
      }

      if (user.role === UserRole.manager) {
        if (!user.managerProfile) {
          await tx.managerProfile.create({
            data: {
              id: user.id,
              email: parsed.data.email ?? `${user.username}@example.com`,
              fullName: parsed.data.fullName ?? user.username
            }
          });
        } else if (parsed.data.email || parsed.data.fullName) {
          await tx.managerProfile.update({
            where: { id: user.id },
            data: {
              email: parsed.data.email ?? user.managerProfile.email,
              fullName: parsed.data.fullName ?? user.managerProfile.fullName
            }
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: "user.updated",
          details: {
            targetUserId: user.id,
            role: user.role,
            isApproved: user.isApproved,
            managerId:
              user.role === UserRole.bidder
                ? (typeof assignmentManagerId !== "undefined"
                    ? assignmentManagerId
                    : user.bidder?.managerId ?? null)
                : null
          }
        }
      });

      return tx.user.findUnique({
        where: { id },
        select: userSelect
      });
    });

    if (!updated) {
      return jsonError("Failed to update user", 500);
    }

    // Revoke active sessions only when auth-critical account data changed.
    // Manager assignment updates should not force logout or slow down reassignment UX.
    if (roleChanged || approvalChanged || profileChanged) {
      await revokeSessionsByUserId(id);
    }

    const notificationBody = managerChanged
      ? "Your manager assignment was updated by an admin."
      : "Your account details or role were updated by an admin.";

    try {
      await createNotifications([updated.id], {
        type: "user.updated",
        title: "Account updated",
        body: notificationBody,
        link: "/bidder",
        data: {
          userId: updated.id,
          role: updated.role,
          isApproved: updated.isApproved,
          managerId: updated.bidder?.managerId ?? null
        }
      });

      publishEvent(
        "user.updated",
        {
          user: {
            id: updated.id,
            username: updated.username,
            role: updated.role,
            isApproved: updated.isApproved
          }
        },
        {
          roles: [UserRole.admin],
          userIds: [updated.id]
        }
      );
    } catch (notificationError) {
      console.warn("user update post-actions failed", notificationError);
    }

    return jsonOk({ user: updated });
  } catch (error) {
    console.error("admin users PATCH failed", error);
    return jsonError("Failed to update user", 500);
  }
}
