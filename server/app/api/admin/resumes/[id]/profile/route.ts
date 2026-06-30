import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import {
  buildCandidateProfileFromText,
  buildResumeRulesText,
  CandidateProfileSchema,
  CANDIDATE_PROFILE_VERSION
} from "@/lib/resume/candidate-profile";
import { aiExtractCandidateProfile } from "@/lib/resume/ai-profile-extractor";
import { toPrismaJson } from "@/lib/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saveProfileSchema = z.object({
  candidateProfile: CandidateProfileSchema,
  resumeRulesText: z.string().trim().min(20)
});

async function requireAdmin(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) {
    return { error: jsonError("Unauthorized", 401) };
  }

  if (auth.user.role !== UserRole.admin) {
    return { error: jsonError("Forbidden", 403) };
  }

  return { auth };
}

export async function GET(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "admin:resumes:profile:get", limit: 80, windowMs: 60_000 });
    if (limited) return limited;

    const authResult = await requireAdmin(req);
    if ("error" in authResult) return authResult.error;

    const resume = await prisma.resume.findUnique({
      where: { id: context.params.id },
      select: {
        id: true,
        managerId: true,
        title: true,
        originalText: true,
        fileUrl: true,
        candidateProfile: true,
        resumeRulesText: true,
        profileStatus: true,
        convertedAt: true,
        converterVersion: true,
        createdAt: true,
        updatedAt: true,
        manager: {
          select: {
            username: true,
            managerProfile: {
              select: {
                fullName: true
              }
            }
          }
        }
      }
    });

    if (!resume) {
      return jsonError("Resume not found", 404);
    }

    return jsonOk({
      resume: {
        ...resume,
        textLength: resume.originalText.length
      }
    });
  } catch (error) {
    console.error("admin resume profile GET failed", error);
    return jsonError("Failed to load resume profile", 500);
  }
}

export async function POST(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "admin:resumes:profile:convert", limit: 40, windowMs: 60_000 });
    if (limited) return limited;

    const authResult = await requireAdmin(req);
    if ("error" in authResult) return authResult.error;

    const resume = await prisma.resume.findUnique({
      where: { id: context.params.id },
      select: {
        id: true,
        title: true,
        originalText: true
      }
    });

    if (!resume) {
      return jsonError("Resume not found", 404);
    }

    if (!resume.originalText.trim()) {
      return jsonError("Resume has no text to convert", 422);
    }

    const aiProfile = await aiExtractCandidateProfile({ text: resume.originalText });
    let candidateProfile: unknown;
    let resumeRulesText: string;
    if (aiProfile) {
      candidateProfile = aiProfile;
      resumeRulesText = buildResumeRulesText(aiProfile);
    } else {
      const converted = buildCandidateProfileFromText({
        text: resume.originalText,
        fileType: "stored-resume-text"
      });
      candidateProfile = converted.profile;
      resumeRulesText = buildResumeRulesText(converted.profile);
    }

    return jsonOk({ candidateProfile, resumeRulesText });
  } catch (error) {
    console.error("admin resume profile POST convert failed", error);
    return jsonError("Failed to convert resume", 500);
  }
}

export async function PUT(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "admin:resumes:profile:save", limit: 40, windowMs: 60_000 });
    if (limited) return limited;

    const authResult = await requireAdmin(req);
    if ("error" in authResult) return authResult.error;

    const body = await req.json().catch(() => null);
    const parsed = saveProfileSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid resume profile payload", 422, parsed.error.flatten());
    }

    const existing = await prisma.resume.findUnique({
      where: { id: context.params.id },
      select: {
        id: true,
        managerId: true,
        title: true
      }
    });

    if (!existing) {
      return jsonError("Resume not found", 404);
    }

    const updated = await prisma.resume.update({
      where: { id: existing.id },
      data: {
        candidateProfile: toPrismaJson(parsed.data.candidateProfile),
        resumeRulesText: parsed.data.resumeRulesText,
        profileStatus: "approved",
        convertedAt: new Date(),
        converterVersion: CANDIDATE_PROFILE_VERSION
      },
      select: {
        id: true,
        managerId: true,
        title: true,
        candidateProfile: true,
        resumeRulesText: true,
        profileStatus: true,
        convertedAt: true,
        converterVersion: true,
        updatedAt: true
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: authResult.auth.user.id,
        action: "resume.profile.approved",
        details: {
          resumeId: existing.id,
          managerId: existing.managerId,
          title: existing.title
        }
      }
    }).catch((err) => console.warn("audit log failed (non-fatal)", err));

    return jsonOk({ resume: updated });
  } catch (error) {
    console.error("admin resume profile PUT failed", error);
    return jsonError("Failed to save resume profile", 500);
  }
}

