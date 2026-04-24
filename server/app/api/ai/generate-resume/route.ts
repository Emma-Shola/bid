import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { generateResumeSchema } from "@/lib/validators";
import { generateResumeContent } from "@/lib/openai";
import { persistNotifications } from "@/lib/notifications";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { createBackgroundJob } from "@/lib/background-jobs";
import { enqueueResumeGenerationJob } from "@/lib/background-queue";
import { extractCandidateNameFromResumeText, resolveResumeSourceText } from "@/lib/resume-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveTemplateResume(input: {
  bidderId: string;
  managerId: string | null;
  resumeId?: string;
}) {
  if (!input.managerId) {
    return null;
  }

  const looksLikeObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value);

  if (input.resumeId && looksLikeObjectId(input.resumeId)) {
    return prisma.resume.findFirst({
      where: {
        id: input.resumeId,
        managerId: input.managerId
      }
    });
  }

  return prisma.resume.findFirst({
    where: {
      managerId: input.managerId
    },
    orderBy: {
      updatedAt: "desc"
    }
  });
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
      bidderId: auth.user.id,
      managerId: bidder.managerId,
      resumeId: parsed.data.resumeId
    });

    if (!templateResume && bidder.managerId && bidder.manager?.managerProfile) {
      const profile = bidder.manager.managerProfile;
      const recoveredText =
        profile.templateResumeText?.trim() ||
        (profile.templateResumeUrl
          ? await resolveResumeSourceText({ resumeUrl: profile.templateResumeUrl })
          : "");

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
      const preview = result.resumeMarkdown || result.coverLetterMarkdown || "";

      const generated = await prisma.generatedResume.create({
        data: {
          resumeId: templateResume.id,
          bidderId: auth.user.id,
          jobTitle: parsed.data.jobTitle,
          company: parsed.data.company,
          jobDescription: parsed.data.jobDescription,
          outputText: result.resumeMarkdown
        },
        select: {
          id: true,
          createdAt: true
        }
      });

      await prisma.auditLog.create({
        data: {
          userId: auth.user.id,
          action: "resume.generated",
          details: {
            resumeId: templateResume.id,
            generatedResumeId: generated.id,
            jobTitle: parsed.data.jobTitle,
            company: parsed.data.company,
            mode: "inline"
          }
        }
      });

      await persistNotifications([auth.user.id], {
        type: "resume.generated",
        title: "Resume generated",
        body: `A tailored resume was generated for ${parsed.data.jobTitle} at ${parsed.data.company}.`,
        link: "/api/ai/generate-resume",
        data: {
          resumeId: templateResume.id,
          generatedResumeId: generated.id,
          jobTitle: parsed.data.jobTitle,
          company: parsed.data.company
        }
      });

      await prisma.backgroundJob.update({
        where: { id: backgroundJob.id },
        data: {
          status: "completed",
          result: {
            ...result,
            meta: {
              resumeId: templateResume.id,
              generatedResumeId: generated.id,
              jobTitle: parsed.data.jobTitle,
              company: parsed.data.company,
              mode: "inline"
            }
          },
          completedAt: new Date()
        }
      });

      return NextResponse.json(
        {
          data: {
            jobId: backgroundJob.id,
            status: "completed",
            resumeId: templateResume.id,
            preview,
            ...result,
            meta: {
              resumeId: templateResume.id,
              generatedResumeId: generated.id,
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

    const generated = await prisma.generatedResume.create({
      data: {
        resumeId: templateResume.id,
        bidderId: auth.user.id,
        jobTitle: parsed.data.jobTitle,
        company: parsed.data.company,
        jobDescription: parsed.data.jobDescription,
        outputText: result.resumeMarkdown
      },
      select: {
        id: true,
        createdAt: true
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "resume.generated",
        details: {
          resumeId: templateResume.id,
          generatedResumeId: generated.id,
          jobTitle: parsed.data.jobTitle,
          company: parsed.data.company
        }
      }
    });

    await persistNotifications([auth.user.id], {
      type: "resume.generated",
      title: "Resume generated",
      body: `A tailored resume was generated for ${parsed.data.jobTitle} at ${parsed.data.company}.`,
      link: "/api/ai/generate-resume",
      data: {
        resumeId: templateResume.id,
        generatedResumeId: generated.id,
        jobTitle: parsed.data.jobTitle,
        company: parsed.data.company
      }
    });

    await prisma.backgroundJob.update({
      where: { id: backgroundJob.id },
      data: {
        status: "completed",
        result: {
          ...result,
          meta: {
            resumeId: templateResume.id,
            generatedResumeId: generated.id,
            jobTitle: parsed.data.jobTitle,
            company: parsed.data.company
          }
        },
        completedAt: new Date()
      }
    });

    return NextResponse.json(
      {
        data: {
          jobId: backgroundJob.id,
          status: "completed",
          resumeId: templateResume.id,
          preview: result.resumeMarkdown || result.coverLetterMarkdown || "",
          ...result,
          meta: {
            resumeId: templateResume.id,
            generatedResumeId: generated.id,
            jobTitle: parsed.data.jobTitle,
            company: parsed.data.company
          }
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("resume generation POST failed", error);
    return jsonError("Failed to generate resume", 500);
  }
}
