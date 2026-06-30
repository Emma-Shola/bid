import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { isRecoverableResumeSource, looksLikeResumeInstructionText } from "@/lib/resume/content-signals";
import { buildCandidateProfileFromText, buildResumeRulesText, CANDIDATE_PROFILE_VERSION } from "@/lib/resume/candidate-profile";
import { aiExtractCandidateProfile } from "@/lib/resume/ai-profile-extractor";
import { saveResumeFile, validateResumeFile } from "@/lib/storage";
import { toPrismaJson } from "@/lib/json";
import { extractResumeText } from "@/lib/resume-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "resumes:upload", limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);

    // Allow managers and admins to upload
    if (auth.user.role !== UserRole.manager && auth.user.role !== UserRole.admin) {
      return jsonError("Only managers and admins can upload resumes", 403);
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const title = String(formData.get("title") ?? "").trim();
    const managerId = String(formData.get("managerId") ?? "").trim() || auth.user.id;
    const providedText = String(formData.get("originalText") ?? "").trim();

    // Validate inputs
    if (!title) {
      return jsonError("Resume title is required", 422);
    }

    if (!managerId) {
      return jsonError("Manager ID is required", 422);
    }

    // Verify manager exists and user has access
    const manager = await prisma.user.findUnique({
      where: { id: managerId },
      select: { id: true, role: true, username: true, managerProfile: true }
    });

    if (!manager || manager.role !== UserRole.manager) {
      return jsonError("Manager not found", 422);
    }

    // Verify auth user is the manager or is admin
    if (auth.user.role === UserRole.manager && auth.user.id !== managerId) {
      return jsonError("Forbidden", 403);
    }

    let fileUrl: string | null = null;
    let extractedText = providedText;

    if (file instanceof File) {
      const validationError = validateResumeFile(file.name, file.type, file.size);
      if (validationError) {
        return jsonError(validationError, 422);
      }

      const bytes = await file.arrayBuffer();

      const extracted = await extractResumeText({
        fileName: file.name,
        mimeType: file.type,
        bytes
      });
      extractedText = extracted.text.trim();

      const saved = await saveResumeFile({
        userId: `manager-${managerId}`,
        fileName: file.name,
        mimeType: file.type,
        bytes
      });
      fileUrl = saved.url;
    }

    // Use provided text if no file, otherwise use extracted text
    const finalText = providedText || extractedText;

    if (!finalText || finalText.trim().length < 20) {
      return jsonError(
        "Could not extract resume text. Upload a clearer PDF/DOCX/TXT/image or paste the full resume text directly.",
        422
      );
    }

    if (looksLikeResumeInstructionText(finalText) && !isRecoverableResumeSource(finalText)) {
      return jsonError(
        "That text looks like a resume instruction prompt, not a source resume. Upload the actual resume instead.",
        422
      );
    }

    // 🗄️ Save to database
    let candidateProfile: unknown = null;
    let resumeRulesText: string | null = null;
    let profileStatus = "converted";
    try {
      // AI extraction handles any PDF layout — falls back to heuristic parser if no API key or on error
      const aiProfile = await aiExtractCandidateProfile({ text: finalText });
      if (aiProfile) {
        candidateProfile = aiProfile;
        resumeRulesText = buildResumeRulesText(aiProfile);
      } else {
        const converted = buildCandidateProfileFromText({
          text: finalText,
          fileType: file instanceof File ? file.type || "uploaded-file" : "text/plain"
        });
        candidateProfile = converted.profile;
        resumeRulesText = buildResumeRulesText(converted.profile);
      }
    } catch (conversionError) {
      console.warn("resume profile conversion failed; saving raw resume for admin converter review", conversionError);
      profileStatus = "conversion_failed";
    }

    const resume = await prisma.resume.create({
      data: {
        managerId: manager.id,
        createdById: auth.user.id,
        title,
        originalText: finalText,
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
        templateResumeText: finalText
      },
      create: {
        id: manager.id,
        email: `${manager.username}@example.com`,
        fullName: manager.username,
        templateResumeUrl: fileUrl,
        templateResumeText: finalText
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "resume.created",
        details: {
          resumeId: resume.id,
          managerId: manager.id,
          title: resume.title,
          hasFile: !!fileUrl
        }
      }
    }).catch((err) => {
      console.warn("audit log failed (non-fatal)", err);
    });

    return jsonOk(
      {
        resume: {
          ...resume,
          hasCandidateProfile: Boolean(resume.candidateProfile),
          hasResumeRules: Boolean(resume.resumeRulesText),
          textLength: finalText.length
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("resumes upload POST failed", error);
    return jsonError("Failed to upload resume", 500);
  }
}
