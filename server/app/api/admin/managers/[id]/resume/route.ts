import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { createNotifications } from "@/lib/notifications";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "admin:managers:resume-delete", limit: 40, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const managerId = context.params.id;
    if (!managerId) {
      return jsonError("Manager id is required", 422);
    }

    const latest = await prisma.resume.findFirst({
      where: { managerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        managerId: true,
        title: true,
        fileUrl: true,
        originalText: true
      }
    });

    if (!latest) {
      await prisma.managerProfile.updateMany({
        where: { id: managerId },
        data: {
          templateResumeUrl: null,
          templateResumeText: null
        }
      });

      return jsonOk({
        deletedResumeId: null,
        managerId,
        activeResumeId: null
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.generatedResume.deleteMany({
        where: { resumeId: latest.id }
      });

      await tx.resume.delete({
        where: { id: latest.id }
      });

      const remainingLatest = await tx.resume.findFirst({
        where: { managerId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fileUrl: true,
          originalText: true
        }
      });

      await tx.managerProfile.updateMany({
        where: { id: managerId },
        data: remainingLatest
          ? {
              templateResumeUrl: remainingLatest.fileUrl ?? null,
              templateResumeText: remainingLatest.originalText ?? null
            }
          : {
              templateResumeUrl: null,
              templateResumeText: null
            }
      });

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: "resume.deleted",
          details: {
            resumeId: latest.id,
            managerId,
            title: latest.title,
            activeResumeId: remainingLatest?.id ?? null
          }
        }
      });

      return {
        deletedResumeId: latest.id,
        managerId,
        activeResumeId: remainingLatest?.id ?? null
      };
    });

    try {
      await createNotifications([result.managerId], {
        type: "resume.deleted",
        title: "Resume template removed",
        body: `An admin removed "${latest.title}" from your templates.`,
        link: "/manager/resumes",
        data: {
          deletedResumeId: result.deletedResumeId,
          activeResumeId: result.activeResumeId
        }
      });
    } catch (notificationError) {
      console.warn("admin manager resume DELETE notification failed", notificationError);
    }

    return jsonOk(result);
  } catch (error) {
    console.error("admin manager resume DELETE failed", error);
    return jsonError("Failed to delete resume", 500);
  }
}
