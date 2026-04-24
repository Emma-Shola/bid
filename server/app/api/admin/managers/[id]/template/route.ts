import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { createNotifications } from "@/lib/notifications";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { extractResumeText } from "@/lib/resume-text";
import { saveResumeFile, validateResumeFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "admin:manager:template:update", limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const managerId = context.params.id;
    if (!managerId) return jsonError("Manager id is required", 422);

    const manager = await prisma.user.findUnique({
      where: { id: managerId },
      include: {
        managerProfile: true
      }
    });

    if (!manager || manager.role !== UserRole.manager) {
      return jsonError("Manager account was not found", 404);
    }

    const formData = await req.formData();
    const file = formData.get("template");
    if (!(file instanceof File)) {
      return jsonError("Manager CV template file is required", 422);
    }

    const validationError = validateResumeFile(file.name, file.type, file.size);
    if (validationError) {
      return jsonError(validationError, 422);
    }

    const bytes = await file.arrayBuffer();
    const saved = await saveResumeFile({
      userId: `manager-${manager.id}`,
      fileName: file.name,
      mimeType: file.type,
      bytes
    });

    const extracted = await extractResumeText({
      fileName: file.name,
      mimeType: file.type,
      bytes
    });
    if (!extracted.text.trim()) {
      return jsonError("We could not extract text from this resume. Upload a clearer PDF/DOCX/TXT/image or paste text manually.", 422);
    }

    const updatedManager = await prisma.$transaction(async (tx) => {
      const profile = manager.managerProfile
        ? await tx.managerProfile.update({
            where: { id: manager.id },
            data: {
              templateResumeUrl: saved.url,
              templateResumeText: extracted.text
            }
          })
        : await tx.managerProfile.create({
            data: {
              id: manager.id,
              email: `${manager.username}@example.com`,
              fullName: manager.username,
              templateResumeUrl: saved.url,
              templateResumeText: extracted.text
            }
          });

      const resume = await tx.resume.create({
        data: {
          managerId: manager.id,
          createdById: auth.user.id,
          title: `${profile.fullName} - ${new Date().toISOString().slice(0, 10)} template`,
          originalText: extracted.text,
          fileUrl: saved.url
        },
        select: {
          id: true
        }
      });

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: "manager.template.updated",
          details: {
            managerUserId: manager.id,
            templateResumeUrl: saved.url,
            resumeId: resume.id
          }
        }
      });

      return { profile, resumeId: resume.id };
    });

    await createNotifications([manager.id], {
      type: "manager.template.updated",
      title: "Manager template updated",
      body: "Your resume template was updated by an admin.",
      link: "/manager",
      data: {
        managerUserId: manager.id,
        templateResumeUrl: updatedManager.profile.templateResumeUrl,
        resumeId: updatedManager.resumeId
      }
    });

    return jsonOk({
      user: {
        id: manager.id,
        username: manager.username,
        role: manager.role,
        isApproved: manager.isApproved
      },
      managerProfile: {
        email: updatedManager.profile.email,
        fullName: updatedManager.profile.fullName,
        templateResumeUrl: updatedManager.profile.templateResumeUrl,
        templateResumeText: updatedManager.profile.templateResumeText
      }
    });
  } catch (error) {
    console.error("admin manager template PATCH failed", error);
    return jsonError("Failed to update manager template", 500);
  }
}
