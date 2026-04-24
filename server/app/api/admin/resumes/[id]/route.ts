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
    const limited = await rateLimit(req, { key: "admin:resumes:delete", limit: 40, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const resumeId = context.params.id;
    if (!resumeId) {
      return jsonError("Resume id is required", 422);
    }

    const existing = await prisma.resume.findUnique({
      where: { id: resumeId },
      select: {
        id: true,
        managerId: true,
        title: true
      }
    });

    if (!existing) {
      return jsonError("Resume not found", 404);
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.resume.delete({
        where: { id: resumeId }
      });

      const latest = await tx.resume.findFirst({
        where: { managerId: existing.managerId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          fileUrl: true,
          originalText: true
        }
      });

      await tx.managerProfile.updateMany({
        where: { id: existing.managerId },
        data: {
          templateResumeUrl: latest?.fileUrl ?? null,
          templateResumeText: latest?.originalText ?? null
        }
      });

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: "resume.deleted",
          details: {
            resumeId: existing.id,
            managerId: existing.managerId,
            title: existing.title,
            activeResumeId: latest?.id ?? null
          }
        }
      });

      return {
        deletedResumeId: existing.id,
        managerId: existing.managerId,
        activeResumeId: latest?.id ?? null
      };
    });

    await createNotifications([result.managerId], {
      type: "resume.deleted",
      title: "Resume template removed",
      body: `An admin removed "${existing.title}" from your templates.`,
      link: "/manager/resumes",
      data: {
        deletedResumeId: result.deletedResumeId,
        activeResumeId: result.activeResumeId
      }
    });

    return jsonOk(result);
  } catch (error) {
    console.error("admin resumes DELETE failed", error);
    return jsonError("Failed to delete resume", 500);
  }
}

