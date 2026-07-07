import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { generateResumeSchema } from "@/lib/validators";
import { generateResumeContent } from "@/lib/openai";
import { persistNotifications } from "@/lib/notifications";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { createBackgroundJob, markBackgroundJobCompleted, markBackgroundJobQaRequired } from "@/lib/background-jobs";
import { enqueueResumeGenerationJob } from "@/lib/background-queue";
import { toPrismaJson } from "@/lib/json";
import { CandidateProfileSchema, type CandidateProfile } from "@/lib/resume/candidate-profile";
import { parseManagerGenerationRules } from "@/lib/manager-rules";
import { checkDuplicateCompany } from "@/lib/resume/duplicate-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveTemplateResume(input: {
  managerId: string | null;
  resumeId?: string;
}) {
  if (!input.managerId) {
    return null;
  }

  const looksLikeObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value);
  const resumes = await prisma.resume.findMany({
    where: {
      managerId: input.managerId
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: 20,
    select: {
      id: true,
      managerId: true,
      title: true,
      candidateProfile: true,
      resumeRulesText: true,
      profileStatus: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (input.resumeId && looksLikeObjectId(input.resumeId)) {
    return resumes.find((resume) => resume.id === input.resumeId) ?? null;
  }

  // Prefer explicitly approved resumes, then any with profile+rules
  return (
    resumes.find((resume) => resume.profileStatus === "approved") ??
    resumes.find((resume) => Boolean(resume.candidateProfile && resume.resumeRulesText)) ??
    resumes[0] ??
    null
  );
}

async function finalizeGeneratedResume(input: {
  authUserId: string;
  templateResumeId: string;
  jobTitle: string;
  company: string;
  backgroundJobId: string;
  mode: "inline" | "queued";
  result: Awaited<ReturnType<typeof generateResumeContent>>;
}) {
  const { cache, ...publicResult } = input.result;
  const requiresQa = !input.result.validation.ok || (input.result.qualityGate ? !input.result.qualityGate.metThreshold : false);

  await prisma.auditLog.create({
    data: {
      userId: input.authUserId,
      action: "resume.generated",
      details: {
        resumeId: input.templateResumeId,
        jobTitle: input.jobTitle,
        company: input.company,
        mode: input.mode,
        cacheHit: cache.hit,
      }
    }
  });

  await persistNotifications([input.authUserId], {
    type: requiresQa ? "resume.qa_required" : "resume.generated",
    title: requiresQa ? "Resume needs review" : "Resume generated",
    body: requiresQa
      ? `Resume for ${input.jobTitle} at ${input.company} needs QA review before download.`
      : `Resume for ${input.jobTitle} at ${input.company} is ready — check your download folder.`,
    link: "/api/ai/generate-resume",
    data: {
      resumeId: input.templateResumeId,
      jobTitle: input.jobTitle,
      company: input.company,
      requiresQa
    }
  });

  // Metadata only — resume content is returned to the client but never persisted server-side.
  // The numeric ATS score is the one exception: it's a small metric (not resume
  // content) needed for the manager-facing resume-activity report.
  const dbResult = {
    meta: {
      resumeId: input.templateResumeId,
      jobTitle: input.jobTitle,
      company: input.company,
      mode: input.mode,
      requiresQa,
      cacheHit: cache.hit,
      score: input.result.score.overall,
    }
  };

  if (requiresQa) {
    await markBackgroundJobQaRequired(input.backgroundJobId, dbResult, publicResult);
  } else {
    await markBackgroundJobCompleted(input.backgroundJobId, dbResult, publicResult);
  }

  return { publicResult, requiresQa };
}

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "ai:resume", limit: 12, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.bidder) {
      return jsonError("Only bidders can generate resumes", 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = generateResumeSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("Invalid generation payload", 422, parsed.error.flatten());
    }

    const bidder = await prisma.bidderProfile.findUnique({
      where: { id: auth.user.id },
      include: {
        manager: {
          include: {
            managerProfile: true
          }
        }
      }
    });

    if (!bidder) {
      return jsonError("Bidder profile is missing", 400);
    }

    const templateResume = await resolveTemplateResume({
      managerId: bidder.managerId,
      resumeId: parsed.data.resumeId
    });

    if (!templateResume) {
      return jsonError("No resume template found. Ask an admin to upload a resume for your manager.", 422);
    }

    if (templateResume.managerId !== bidder.managerId) {
      return jsonError("You do not have access to this resume template.", 403);
    }

    // Hard gate: resume must be reviewed and approved by an admin before generation
    if (
      !templateResume.candidateProfile ||
      !templateResume.resumeRulesText ||
      templateResume.profileStatus !== "approved"
    ) {
      return jsonError(
        "Your manager's resume has not been approved by an admin yet. An admin must review and approve the candidate profile before you can generate resumes.",
        422
      );
    }

    const candidateProfile = CandidateProfileSchema.parse(templateResume.candidateProfile) as CandidateProfile;
    const resumeRulesText = templateResume.resumeRulesText;
    const candidateName = candidateProfile.personalInfo.name;

    const managerRules = parseManagerGenerationRules(bidder.manager?.managerProfile?.generationRules);
    const qualityGate =
      managerRules.minAtsScore != null
        ? { minAtsScore: managerRules.minAtsScore, maxAttempts: managerRules.maxGenerationAttempts }
        : undefined;

    const duplicateCheck = await checkDuplicateCompany({
      userId: auth.user.id,
      company: parsed.data.company,
      managerGenerationRulesRaw: bidder.manager?.managerProfile?.generationRules,
      appliedCompaniesRaw: bidder.manager?.managerProfile?.appliedCompanies
    });

    if (duplicateCheck.blocked) {
      return jsonError(
        `You already applied to ${parsed.data.company} on ${duplicateCheck.appliedOn}. Your manager blocks reapplying to the same company within ${duplicateCheck.cooldownDays} days.`,
        409
      );
    }

    const backgroundJob = await createBackgroundJob({
      userId: auth.user.id,
      type: "resume.generate",
      payload: {
        resumeId: templateResume.id,
        jobTitle: parsed.data.jobTitle,
        company: parsed.data.company,
        jobDescription: parsed.data.jobDescription,
        jobUrl: parsed.data.jobUrl || null,
        candidateName,
        candidateProfile: toPrismaJson(candidateProfile),
        resumeRulesText
      }
    });

    if (parsed.data.preferInline) {
      const result = await generateResumeContent({
        jobTitle: parsed.data.jobTitle,
        company: parsed.data.company,
        jobDescription: parsed.data.jobDescription,
        candidateName,
        candidateProfile,
        resumeRulesText,
        qualityGate
      });

      const { publicResult, requiresQa } = await finalizeGeneratedResume({
        authUserId: auth.user.id,
        templateResumeId: templateResume.id,
        jobTitle: parsed.data.jobTitle,
        company: parsed.data.company,
        backgroundJobId: backgroundJob.id,
        mode: "inline",
        result
      });

      const preview = publicResult.resumeMarkdown || publicResult.coverLetterMarkdown || "";

      return NextResponse.json(
        {
          data: {
            jobId: backgroundJob.id,
            status: requiresQa ? "qa_required" : "completed",
            resumeId: templateResume.id,
            preview,
            ...publicResult,
            meta: {
              resumeId: templateResume.id,
              jobTitle: parsed.data.jobTitle,
              company: parsed.data.company,
              mode: "inline"
            }
          }
        },
        { status: 200 }
      );
    }

    const queuedJob = await enqueueResumeGenerationJob({
      jobId: backgroundJob.id,
      userId: auth.user.id,
      payload: {
        resumeId: templateResume.id,
        jobTitle: parsed.data.jobTitle,
        company: parsed.data.company,
        jobDescription: parsed.data.jobDescription,
        candidateName,
        candidateProfile: toPrismaJson(candidateProfile),
        resumeRulesText
      }
    }).catch((error) => {
      console.warn("resume queue enqueue failed, falling back to inline generation", error);
      return null;
    });

    if (queuedJob) {
      return NextResponse.json(
        {
          data: {
            jobId: backgroundJob.id,
            status: "queued",
            resumeId: templateResume.id,
            message: "Resume generation has been queued"
          }
        },
        { status: 202 }
      );
    }

    const result = await generateResumeContent({
      jobTitle: parsed.data.jobTitle,
      company: parsed.data.company,
      jobDescription: parsed.data.jobDescription,
      candidateName,
      candidateProfile,
      resumeRulesText,
      qualityGate
    });

    const { publicResult, requiresQa } = await finalizeGeneratedResume({
      authUserId: auth.user.id,
      templateResumeId: templateResume.id,
      jobTitle: parsed.data.jobTitle,
      company: parsed.data.company,
      backgroundJobId: backgroundJob.id,
      mode: "queued",
      result
    });

    return NextResponse.json(
      {
        data: {
          jobId: backgroundJob.id,
          status: requiresQa ? "qa_required" : "completed",
          resumeId: templateResume.id,
          preview: publicResult.resumeMarkdown || publicResult.coverLetterMarkdown || "",
          ...publicResult,
          meta: {
            resumeId: templateResume.id,
            jobTitle: parsed.data.jobTitle,
            company: parsed.data.company
          }
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("resume generation POST failed", error);

    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";

    if (
      /has not been approved by an admin/i.test(message) ||
      /no resume template found/i.test(message) ||
      /do not have access to this resume template/i.test(message)
    ) {
      return jsonError(message || "Invalid resume source", 422);
    }

    return jsonError(message || "Failed to generate resume", 500);
  }
}
