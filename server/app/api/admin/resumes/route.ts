import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { createNotifications } from "@/lib/notifications";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { adminResumeCreateSchema } from "@/lib/validators";
import { extractResumeText } from "@/lib/resume-text";
import { isRecoverableResumeSource, looksLikeResumeInstructionText } from "@/lib/resume/content-signals";
import { saveResumeFile, validateResumeFile } from "@/lib/storage";
import { buildCandidateProfileFromText, buildResumeRulesText, CANDIDATE_PROFILE_VERSION } from "@/lib/resume/candidate-profile";
import { aiExtractCandidateProfile } from "@/lib/resume/ai-profile-extractor";
import { toPrismaJson } from "@/lib/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "admin:resumes:create", limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const formData = await req.formData();
    const file = formData.get("file");

    const parsed = adminResumeCreateSchema.safeParse({
      managerId: String(formData.get("managerId") ?? ""),
      title: String(formData.get("title") ?? ""),
      originalText: String(formData.get("originalText") ?? "").trim() || undefined
    });

    if (!parsed.success) {
      return jsonError("Invalid resume payload", 422, parsed.error.flatten());
    }

    const manager = await prisma.user.findUnique({
      where: { id: parsed.data.managerId },
      select: { id: true, role: true, username: true, managerProfile: true }
    });

    if (!manager || manager.role !== UserRole.manager) {
      return jsonError("Assigned manager was not found", 422);
    }

    let fileUrl: string | null = null;
    let extractedText = "";

    if (file instanceof File) {
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

      fileUrl = saved.url;
      extractedText = extracted.text.trim();
    }

    const originalText = parsed.data.originalText?.trim() || extractedText.trim();
    if (!originalText) {
      return jsonError("Could not extract resume text. Upload a clearer PDF/DOCX/TXT/image or paste the full resume text directly.", 422);
    }

    if (looksLikeResumeInstructionText(originalText) && !isRecoverableResumeSource(originalText)) {
      return jsonError(
        "That text looks like a resume instruction prompt, not a source resume. Upload the actual resume instead.",
        422
      );
    }

    let candidateProfile: unknown = null;
    let resumeRulesText: string | null = null;
    let profileStatus = "converted";
    try {
      const aiProfile = await aiExtractCandidateProfile({ text: originalText });
      if (aiProfile) {
        candidateProfile = aiProfile;
        resumeRulesText = buildResumeRulesText(aiProfile);
      } else {
        const converted = buildCandidateProfileFromText({
          text: originalText,
          fileType: file instanceof File ? file.type || "uploaded-file" : "text/plain"
        });
        candidateProfile = converted.profile;
        resumeRulesText = buildResumeRulesText(converted.profile);
      }
    } catch (conversionError) {
      console.warn("admin resume profile conversion failed; saving raw resume for converter review", conversionError);
      profileStatus = "conversion_failed";
    }

    const resume = await prisma.resume.create({
      data: {
        managerId: manager.id,
        createdById: auth.user.id,
        title: parsed.data.title.trim(),
        originalText,
        candidateProfile: candidateProfile ? toPrismaJson(candidateProfile) : undefined,
        resumeRulesText: resumeRulesText ?? undefined,
        profileStatus,
        convertedAt: candidateProfile ? new Date() : undefined,
        converterVersion: candidateProfile ? CANDIDATE_PROFILE_VERSION : undefined,
        fileUrl
      },
      select: {
        id: true,
        managerId: true,
        title: true,
        fileUrl: true,
        candidateProfile: true,
        resumeRulesText: true,
        profileStatus: true,
        convertedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    await prisma.managerProfile.upsert({
      where: { id: manager.id },
      update: {
        templateResumeUrl: fileUrl ?? manager.managerProfile?.templateResumeUrl ?? null,
        templateResumeText: originalText
      },
      create: {
        id: manager.id,
        email: `${manager.username}@example.com`,
        fullName: manager.username,
        templateResumeUrl: fileUrl,
        templateResumeText: originalText
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "resume.created",
        details: {
          resumeId: resume.id,
          managerId: manager.id,
          title: resume.title
        }
      }
    }).catch((err) => {
      console.warn("audit log failed (non-fatal)", err);
    });

    await createNotifications([manager.id], {
      type: "resume.created",
      title: "Resume template uploaded",
      body: `A new resume template "${resume.title}" was assigned to you.`,
      link: "/manager/resumes",
      data: {
        resumeId: resume.id
      }
    });

    return jsonOk({
      resume: {
        ...resume,
        hasCandidateProfile: Boolean(resume.candidateProfile),
        hasResumeRules: Boolean(resume.resumeRulesText),
        textLength: originalText.length
      }
    }, { status: 201 });
  } catch (error) {
    console.error("admin resumes POST failed", error);
    return jsonError("Failed to create resume", 500);
  }
}
