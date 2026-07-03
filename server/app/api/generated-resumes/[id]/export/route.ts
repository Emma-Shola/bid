import { Prisma, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { applyCorsHeaders } from "@/lib/cors";
import { buildFallbackTailoredResume } from "@/lib/resume/validator";
import { parseResumeText } from "@/lib/resume/parser";
import { normalizeParsedResume } from "@/lib/resume/normalizer";
import { buildResumeDocxBuffer, buildResumePdfBuffer } from "@/lib/resume/exporter";
import { analyzeJobDescription } from "@/lib/resume/jd";
import { buildProfileSkeleton } from "@/lib/resume/profile-skeleton";
import { type ParsedResume, type TailoredResume } from "@/lib/resume/types";
import { parseManagerGenerationRules } from "@/lib/manager-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isStructuredResume(value: unknown): value is { source: ParsedResume; tailored: TailoredResume } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { source?: unknown; tailored?: unknown };
  return Boolean(candidate.source && candidate.tailored);
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
}

function looksLikePromptNoise(value: string) {
  return /above is job description|following is current resume|insert strong headline|give me my resume|base json format|do not mention|tailoring my resume according to job description|summary content must|work experience -/i.test(
    value
  );
}

function looksLikePlaceholderText(value: string) {
  return /^(john doe|jane doe|company name|previous company name|university name|school name|your name|your email|your phone number|your address|city, state|month year)$/i.test(
    value.trim()
  );
}

function hasPlaceholderResumeSource(source: ParsedResume) {
  const fields = [
    source.name,
    source.title,
    source.summary,
    ...source.skills,
    ...source.skillCategories.flatMap((category) => [category.category, ...category.skills]),
    ...source.experience.flatMap((item) => [item.role, item.company, item.location, ...item.bullets.slice(0, 2)]),
    ...source.education.flatMap((item) => [item.school, item.degree, item.location, ...item.details.slice(0, 2)]),
    ...source.certificates
  ];

  return fields.some((field) => {
    const normalized = field.trim();
    return normalized ? looksLikePlaceholderText(normalized) || /(?:^|\s)(insert|replace|follow|tailor|summarize|modify)(?:\s|$)/i.test(normalized) : false;
  });
}

function hasUsableResumeSource(source: ParsedResume) {
  const text = [
    source.name,
    source.title,
    source.summary,
    ...source.skills.slice(0, 10),
    ...source.skillCategories.flatMap((category) => [category.category, ...category.skills]),
    ...source.experience.flatMap((item) => [item.role, item.company, ...item.bullets.slice(0, 3)]),
    ...source.education.flatMap((item) => [item.school, item.degree, ...item.details.slice(0, 2)]),
    ...source.certificates.slice(0, 6)
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");

  if (!text) {
    return false;
  }

  if (looksLikePromptNoise(text)) {
    return false;
  }

  return source.experience.length > 0 || source.skills.length > 0 || source.skillCategories.length > 0 || source.summary.length > 0;
}

type GeneratedResumeExportRecord = {
  outputText: string;
  jobTitle: string;
  company: string;
  jobDescription: string;
  structuredJson: Prisma.JsonValue | null;
  resume: {
    title: string;
    managerId: string;
    originalText: string;
  };
};

async function loadExportPayload(generated: GeneratedResumeExportRecord | null) {
  if (!generated) {
    return null;
  }

  if (isStructuredResume(generated.structuredJson)) {
    const structuredSource = generated.structuredJson.source;
    const structuredTailored = generated.structuredJson.tailored;
    if (hasUsableResumeSource(structuredSource) && !hasPlaceholderResumeSource(structuredSource)) {
      return {
        source: buildProfileSkeleton({
          source: structuredSource,
          targetTitle: generated.jobTitle
        }),
        tailored: structuredTailored
      };
    }

    const reparsedSource = normalizeParsedResume(
      parseResumeText({
        text: generated.resume.originalText || generated.outputText,
        candidateName: ""
      }),
      ""
    );
    const reparsedSkeleton = buildProfileSkeleton({
      source: reparsedSource,
      targetTitle: generated.jobTitle
    });

    if (hasUsableResumeSource(reparsedSkeleton) && !hasPlaceholderResumeSource(reparsedSkeleton)) {
      return { source: reparsedSkeleton, tailored: structuredTailored };
    }
  }

  const parsed = normalizeParsedResume(
    parseResumeText({
      text: generated.resume.originalText || generated.outputText,
      candidateName: ""
    }),
    ""
  );
  const skeleton = buildProfileSkeleton({
    source: parsed,
    targetTitle: generated.jobTitle
  });
  const jobAnalysis = analyzeJobDescription({
    title: generated.jobTitle,
    company: generated.company,
    jobDescription: generated.jobDescription,
    sourceSkills: []
  });
  const tailored = buildFallbackTailoredResume(skeleton, generated.jobTitle, generated.company, jobAnalysis);

  return {
    source: skeleton,
    tailored
  };
}

export async function GET(req: NextRequest, context: { params: { id: string } }) {
  const generatedResumeId = context.params.id;
  const log = (message: string) => console.log(`[resume-export] id=${generatedResumeId} ${message}`);
  log("request received");

  try {
    const limited = await rateLimit(req, { key: "generated-resumes:export", limit: 60, windowMs: 60_000 });
    if (limited) {
      log("rejected: rate limited");
      return applyCorsHeaders(req, limited);
    }

    const auth = await getAuthUser(req);
    if (!auth) {
      log("rejected: no valid session/auth cookie");
      return applyCorsHeaders(req, jsonError("Unauthorized", 401));
    }
    log(`auth ok userId=${auth.user.id} role=${auth.user.role}`);

    const format = (req.nextUrl.searchParams.get("format") || "pdf").toLowerCase();
    if (format !== "pdf" && format !== "docx") {
      log(`rejected: unsupported format "${format}"`);
      return applyCorsHeaders(req, jsonError("Unsupported export format", 422));
    }

    const generated = await prisma.generatedResume.findUnique({
      where: { id: generatedResumeId },
      select: {
        id: true,
        bidderId: true,
        jobTitle: true,
        company: true,
        jobDescription: true,
        outputText: true,
        structuredJson: true,
        atsScore: true,
        atsDetails: true,
        resume: {
          select: {
            id: true,
            managerId: true,
            title: true,
            originalText: true,
            manager: { select: { managerProfile: { select: { generationRules: true } } } }
          }
        }
      }
    });

    if (!generated) {
      log("rejected: no GeneratedResume record found for this id");
      return applyCorsHeaders(req, jsonError("Generated resume not found", 404));
    }
    log(`record found bidderId=${generated.bidderId} managerId=${generated.resume.managerId}`);

      const allowed =
        auth.user.role === UserRole.admin ||
        (auth.user.role === UserRole.bidder && auth.user.id === generated.bidderId) ||
        (auth.user.role === UserRole.manager && auth.user.id === generated.resume.managerId);

    if (!allowed) {
      log(`rejected: userId=${auth.user.id} role=${auth.user.role} is not the owning bidder/manager/admin`);
      return applyCorsHeaders(req, jsonError("Forbidden", 403));
    }

    const exportPayload = await loadExportPayload(generated);
    if (!exportPayload) {
      log("rejected: loadExportPayload returned null (no usable parsed/structured resume source)");
      return applyCorsHeaders(req, jsonError("Generated resume is missing export data", 422));
    }
    log(`export payload ready experienceCount=${exportPayload.source.experience.length} format=${format}`);

    const buffer =
      format === "docx"
        ? await buildResumeDocxBuffer({
            source: exportPayload.source,
            tailored: exportPayload.tailored
          })
        : await buildResumePdfBuffer({
            source: exportPayload.source,
            tailored: exportPayload.tailored
          });
    log(`buffer built size=${buffer.length} bytes`);

    const managerRules = parseManagerGenerationRules(generated.resume.manager?.managerProfile?.generationRules);
    const candidateName = exportPayload.source.name?.trim();
    const fileBase =
      managerRules.filenameIncludesCandidateName && candidateName
        ? sanitizeFileName(`${candidateName} - ${generated.company}`)
        : sanitizeFileName(
            [generated.resume.title || generated.jobTitle, generated.company, format].filter(Boolean).join("-")
          );
    const contentType =
      format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";

    const response = new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileBase}.${format}"`,
        "Cache-Control": "private, no-store"
      }
    });
    response.headers.set("Access-Control-Expose-Headers", "Content-Disposition, Content-Type");
    log(`responding 200 fileName="${fileBase}.${format}"`);
    return applyCorsHeaders(req, response);
  } catch (error) {
    console.error(`[resume-export] id=${generatedResumeId} threw during export`, error);
    return applyCorsHeaders(req, jsonError("Failed to export resume", 500));
  }
}
