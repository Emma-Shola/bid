import { UserRole, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeWhitespace } from "@/lib/resume/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InterviewRequestSchema = z
  .object({
    question: z.string().trim().min(3),
    applicationId: z.string().trim().optional(),
    jobTitle: z.string().trim().optional(),
    company: z.string().trim().optional(),
    jobDescription: z.string().trim().optional(),
  })
  .strict();

const InterviewAnswerSchema = z
  .object({
    answer: z.string().min(1),
    keyPoints: z.array(z.string().min(1)).default([]),
    followUpQuestions: z.array(z.string().min(1)).default([]),
  })
  .strict();

let client: OpenAI | null = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  client ??= new OpenAI({ apiKey });
  return client;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => (typeof item === "string" ? [item.trim()] : []))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function extractText(value: unknown) {
  return typeof value === "string" ? normalizeWhitespace(value) : "";
}

function formatSkills(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([category, raw]) => {
      const skills = stringList(raw);
      if (skills.length === 0) return "";
      return `${category}: ${skills.join(", ")}`;
    })
    .filter(Boolean)
    .join("\n");
}

function formatExperience(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((entry, index) => {
      const item = asRecord(entry);
      const company = extractText(item.company ?? item.employer ?? "");
      const role = extractText(item.role ?? item.title ?? item.position ?? "");
      const duration = extractText(item.duration ?? item.date ?? item.period ?? "");
      const bullets = stringList(item.bullets ?? item.highlights ?? []);

      const heading = [
        `${index + 1}. ${role || "Role"}`,
        company ? `at ${company}` : "",
        duration ? `(${duration})` : "",
      ]
        .filter(Boolean)
        .join(" ");

      const bulletText = bullets.length
        ? bullets.map((bullet) => `   - ${bullet}`).join("\n")
        : "   - Delivered measurable technical and business outcomes across the role.";

      return `${heading}\n${bulletText}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildResumeContext(record: {
  outputText: string | null;
  structuredJson: Prisma.JsonValue | null;
  resumeTitle: string;
}) {
  const structured = asRecord(record.structuredJson);
  const source = asRecord(structured.source);
  const tailored = asRecord(structured.tailored);

  const candidateName = extractText(source.name ?? "");
  const title = extractText(source.title ?? "");
  const sourceSummary = extractText(source.summary ?? "");
  const tailoredSummary = extractText(tailored.summary ?? "");
  const summary = tailoredSummary || sourceSummary;
  const skills = formatSkills(tailored.tailoredSkills ?? source.skills ?? {});
  const experience = formatExperience(tailored.tailoredExperience ?? source.experience ?? []);

  const sections = [
    `Resume title: ${record.resumeTitle}`,
    candidateName ? `Candidate name: ${candidateName}` : "",
    title ? `Current title: ${title}` : "",
    summary ? `Summary:\n${summary}` : "",
    skills ? `Skills:\n${skills}` : "",
    experience ? `Experience:\n${experience}` : "",
    !summary && !skills && !experience && record.outputText ? `Resume text:\n${normalizeWhitespace(record.outputText)}` : "",
  ].filter(Boolean);

  return sections.join("\n\n");
}

function buildPrompt(input: {
  question: string;
  jobTitle: string;
  company: string;
  jobDescription: string;
  resumeContext: string;
}) {
  return [
    "You are an elite interview coach for senior software engineering candidates.",
    "Return strict JSON only and nothing else.",
    "Do not use markdown fences, code blocks, commentary, or preambles.",
    "Write in the candidate's voice using first person.",
    "The answer should sound polished, confident, truthful, and recruiter-grade.",
    "Never invent employers, skills, projects, metrics, or responsibilities that are not supported by the resume context.",
    "If the question asks for something not directly evidenced, answer by leaning on adjacent truthful experience and transferable strengths rather than fabricating details.",
    "Use the job context to tailor the answer, but keep the response grounded in the candidate's resume.",
    "Keep the answer concise and strong: about 120 to 180 words, or 2 to 4 short paragraphs.",
    "The answer should be appropriate for a live interview response, not a bullet list.",
    "If the question is behavioral, structure the response like a brief STAR answer without labeling it.",
    "If the question is technical, include concrete systems, decisions, scale, reliability, or performance details from the resume context when relevant.",
    "",
    "OUTPUT CONTRACT:",
    "answer: a polished interview answer in first person",
    "keyPoints: 3 to 5 short reminders the candidate can reuse while speaking",
    "followUpQuestions: 2 to 4 likely follow-up questions the interviewer may ask",
    "",
    `JOB TITLE: ${input.jobTitle || "N/A"}`,
    `COMPANY: ${input.company || "N/A"}`,
    "",
    "JOB DESCRIPTION:",
    input.jobDescription || "N/A",
    "",
    "RESUME CONTEXT:",
    input.resumeContext || "N/A",
    "",
    "QUESTION:",
    input.question,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "ai:interview", limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.bidder) {
      return jsonError("Only bidders can use interview coaching", 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = InterviewRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid interview question payload", 422, parsed.error.flatten());
    }

    const bidder = await prisma.bidderProfile.findUnique({
      where: { id: auth.user.id },
      select: {
        managerId: true,
        manager: {
          select: {
            username: true,
            managerProfile: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!bidder) {
      return jsonError("Bidder profile is missing", 400);
    }

    const application = parsed.data.applicationId
      ? await prisma.application.findFirst({
          where: {
            id: parsed.data.applicationId,
            bidderId: auth.user.id,
          },
          select: {
            jobTitle: true,
            company: true,
            jobDescription: true,
          },
        })
      : null;

    const latestGeneratedResume = await prisma.generatedResume.findFirst({
      where: { bidderId: auth.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        outputText: true,
        structuredJson: true,
        resume: {
          select: {
            title: true,
            originalText: true,
          },
        },
      },
    });

    const fallbackResume = latestGeneratedResume
      ? null
      : bidder.managerId
        ? await prisma.resume
            .findFirst({
              where: {
                managerId: bidder.managerId,
              },
              orderBy: {
                updatedAt: "desc",
              },
              select: {
                title: true,
                originalText: true,
              },
            })
            .catch(() => null)
        : null;

    const resolvedJobTitle = parsed.data.jobTitle || application?.jobTitle || "";
    const resolvedCompany = parsed.data.company || application?.company || "";
    const resolvedJobDescription = parsed.data.jobDescription || application?.jobDescription || "";

    const resumeContext = latestGeneratedResume
      ? buildResumeContext({
          outputText: latestGeneratedResume.outputText,
          structuredJson: latestGeneratedResume.structuredJson,
          resumeTitle:
            latestGeneratedResume.resume?.title ||
            `${bidder.manager?.managerProfile?.fullName || bidder.manager?.username || "Latest"} resume`,
        })
      : fallbackResume
        ? [
            `Resume title: ${fallbackResume.title}`,
            `Resume text:\n${normalizeWhitespace(fallbackResume.originalText)}`,
          ].join("\n\n")
        : "";

    if (!resumeContext.trim()) {
      return jsonError(
        "No resume context is available yet. Generate or upload a resume first so the interview coach can ground its answers.",
        422,
      );
    }

    const openai = getClient();
    if (!openai) {
      return jsonError("OPENAI_API_KEY is required for interview coaching", 500);
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_INTERVIEW_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.3,
      instructions:
        "You are a professional interview coach for senior software engineers. Return only strict JSON that matches the schema exactly. Keep the answer truthful, concise, polished, and grounded in the candidate's resume and job context.",
      input: buildPrompt({
        question: parsed.data.question,
        jobTitle: resolvedJobTitle,
        company: resolvedCompany,
        jobDescription: resolvedJobDescription,
        resumeContext,
      }),
      text: {
        format: zodTextFormat(InterviewAnswerSchema, "interview_answer"),
      },
    });

    const raw = normalizeWhitespace(response.output_text || "");
    if (!raw) {
      return jsonError("OpenAI returned an empty interview answer", 500);
    }

    const answer = InterviewAnswerSchema.parse(JSON.parse(raw));

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "interview.answer.generated",
        details: {
          question: parsed.data.question,
          applicationId: parsed.data.applicationId ?? null,
          jobTitle: resolvedJobTitle || null,
          company: resolvedCompany || null,
        },
      },
    }).catch(() => null);

    return NextResponse.json({
      data: answer,
    });
  } catch (error) {
    console.error("interview answer POST failed", error);
    return jsonError("Failed to generate interview answer", 500);
  }
}
