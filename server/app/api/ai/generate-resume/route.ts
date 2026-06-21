import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { generateResumeSchema } from "@/lib/validators";
import { generateResumeContent } from "@/lib/openai";
import { persistNotifications } from "@/lib/notifications";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { createBackgroundJob, markBackgroundJobQaRequired } from "@/lib/background-jobs";
import { enqueueResumeGenerationJob } from "@/lib/background-queue";
import { extractCandidateNameFromResumeText, resolveResumeSourceText } from "@/lib/resume-source";
import { isRecoverableResumeSource, looksLikeResumeInstructionText } from "@/lib/resume/content-signals";
import { extractStructuredResumeFromText } from "@/lib/resume/structured-json";
import { createGeneratedResumeRecord } from "@/lib/resume/persistence";
import { toPrismaJson } from "@/lib/json";

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
    select: {
      id: true,
      managerId: true,
      title: true,
      originalText: true,
      fileUrl: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (input.resumeId && looksLikeObjectId(input.resumeId)) {
    return resumes.find((resume) => resume.id === input.resumeId) ?? null;
  }

  return resumes.find((resume) => isRecoverableResumeSource(resume.originalText)) ?? resumes[0] ?? null;
}

async function finalizeGeneratedResume(input: {
  authUserId: string;
  templateResumeId: string;
  jobTitle: string;
  company: string;
  jobDescription: string;
  backgroundJobId: string;
  mode: "inline" | "queued";
  result: Awaited<ReturnType<typeof generateResumeContent>>;
}) {
  const { cache, ...publicResult } = input.result;
  const requiresQa = !input.result.validation.ok;
  const generatedResumeId =
    cache.hit && cache.recordId
      ? cache.recordId
      : (
          await createGeneratedResumeRecord({
            resumeId: input.templateResumeId,
            bidderId: input.authUserId,
            jobTitle: input.jobTitle,
            company: input.company,
            jobDescription: input.jobDescription,
            cacheFingerprint: cache.fingerprint,
            modelName: cache.modelName,
            promptVersion: cache.promptVersion,
            result: input.result
          })
        ).id;

  await prisma.auditLog.create({
    data: {
      userId: input.authUserId,
      action: "resume.generated",
      details: {
        resumeId: input.templateResumeId,
        generatedResumeId,
        jobTitle: input.jobTitle,
        company: input.company,
        mode: input.mode
      }
    }
  });

  await persistNotifications([input.authUserId], {
    type: requiresQa ? "resume.qa_required" : "resume.generated",
    title: requiresQa ? "Resume needs review" : "Resume generated",
    body: requiresQa
      ? `A tailored resume was generated for ${input.jobTitle} at ${input.company}, but it needs QA review before download.`
      : `A tailored resume was generated for ${input.jobTitle} at ${input.company}.`,
    link: "/api/ai/generate-resume",
    data: {
      resumeId: input.templateResumeId,
      generatedResumeId,
      jobTitle: input.jobTitle,
      company: input.company,
      requiresQa
    }
  });

  const terminalResult = {
    ...publicResult,
    meta: {
      resumeId: input.templateResumeId,
      generatedResumeId,
      jobTitle: input.jobTitle,
      company: input.company,
      mode: input.mode,
      requiresQa
    }
  };

  if (requiresQa) {
    await markBackgroundJobQaRequired(input.backgroundJobId, terminalResult);
  } else {
    await prisma.backgroundJob.update({
      where: { id: input.backgroundJobId },
      data: {
        status: "completed",
        result: toPrismaJson(terminalResult),
        completedAt: new Date()
      }
    });
  }

  return { generatedResumeId, publicResult };
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

    let templateResume = await resolveTemplateResume({
      managerId: bidder.managerId,
      resumeId: parsed.data.resumeId
    });

    if (!templateResume && bidder.managerId && bidder.manager?.managerProfile) {
      const profile = bidder.manager.managerProfile;
      const recoveredText =
        profile.templateResumeText?.trim() ||
        (profile.templateResumeUrl ? await resolveResumeSourceText({ resumeUrl: profile.templateResumeUrl }) : "");

      if (recoveredText.trim()) {
        templateResume = await prisma.resume.create({
          data: {
            managerId: bidder.managerId,
            title: `${profile.fullName || bidder.manager.username} - Imported Template`,
            originalText: recoveredText.trim(),
            fileUrl: profile.templateResumeUrl
          }
        });
      }
    }

    if (!templateResume) {
      return jsonError("No manager resume template found. Ask admin to upload a template for your manager.", 422);
    }

    if (templateResume.managerId !== bidder.managerId) {
      return jsonError("You do not have access to this resume template.", 403);
    }

    const sourceResumeText = templateResume.originalText.trim();
    if (!sourceResumeText) {
      return jsonError("Selected template has no usable text content.", 422);
    }

    if (looksLikeResumeInstructionText(sourceResumeText) && !isRecoverableResumeSource(sourceResumeText)) {
      const recoveredStructuredResume = extractStructuredResumeFromText(
        sourceResumeText,
        extractCandidateNameFromResumeText(sourceResumeText)
      );
      if (!recoveredStructuredResume) {
        return jsonError(
          "Selected resume template looks like an instruction prompt, not a real resume. Upload the original resume instead.",
          422
        );
      }
    }

    const candidateName = extractCandidateNameFromResumeText(sourceResumeText);

    const backgroundJob = await createBackgroundJob({
      userId: auth.user.id,
      type: "resume.generate",
      payload: {
        resumeId: templateResume.id,
        jobTitle: parsed.data.jobTitle,
        company: parsed.data.company,
        jobDescription: parsed.data.jobDescription,
        resumeText: sourceResumeText,
        candidateName
      }
    });

    if (parsed.data.preferInline) {
      const result = await generateResumeContent({
        jobTitle: parsed.data.jobTitle,
        company: parsed.data.company,
        jobDescription: parsed.data.jobDescription,
        resumeText: sourceResumeText,
        candidateName
      });

      const { publicResult, generatedResumeId } = await finalizeGeneratedResume({
        authUserId: auth.user.id,
        templateResumeId: templateResume.id,
        jobTitle: parsed.data.jobTitle,
        company: parsed.data.company,
        jobDescription: parsed.data.jobDescription,
        backgroundJobId: backgroundJob.id,
        mode: "inline",
        result
      });

      const preview = publicResult.resumeMarkdown || publicResult.coverLetterMarkdown || "";

      return NextResponse.json(
        {
          data: {
            jobId: backgroundJob.id,
            status: result.validation.ok ? "completed" : "qa_required",
            resumeId: templateResume.id,
            preview,
            ...publicResult,
            meta: {
              resumeId: templateResume.id,
              generatedResumeId,
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
        resumeText: sourceResumeText,
        candidateName
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
      resumeText: sourceResumeText,
      candidateName
    });

    const { publicResult, generatedResumeId } = await finalizeGeneratedResume({
      authUserId: auth.user.id,
      templateResumeId: templateResume.id,
      jobTitle: parsed.data.jobTitle,
      company: parsed.data.company,
      jobDescription: parsed.data.jobDescription,
      backgroundJobId: backgroundJob.id,
      mode: "queued",
      result
    });

    return NextResponse.json(
      {
        data: {
          jobId: backgroundJob.id,
          status: result.validation.ok ? "completed" : "qa_required",
          resumeId: templateResume.id,
          preview: publicResult.resumeMarkdown || publicResult.coverLetterMarkdown || "",
          ...publicResult,
          meta: {
            resumeId: templateResume.id,
            generatedResumeId,
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
      /instruction-only txt files cannot be used as source resumes/i.test(message) ||
      /source resume text is required/i.test(message) ||
      /selected template has no usable text content/i.test(message) ||
      /looks like a resume instruction prompt/i.test(message) ||
      /no manager resume template found/i.test(message)
    ) {
      return jsonError(message || "Invalid resume source", 422);
    }

    return jsonError(message || "Failed to generate resume", 500);
  }
}
