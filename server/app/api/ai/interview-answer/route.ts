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
    structured: z
      .object({
        source: z.record(z.unknown()),
        tailored: z.record(z.unknown()),
      })
      .optional(),
    refineInstruction: z.string().trim().min(1).max(300).optional(),
    previousAnswer: z.string().trim().min(1).max(4000).optional(),
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

function buildCandidateProfileContext(profile: unknown, resumeTitle: string) {
  const record = asRecord(profile);
  const personalInfo = asRecord(record.personalInfo);
  const name = extractText(personalInfo.name ?? "");

  const employmentHistory = Array.isArray(record.employmentHistory) ? record.employmentHistory : [];
  const experience = employmentHistory
    .map((entry, index) => {
      const item = asRecord(entry);
      const company = extractText(item.company ?? "");
      const role = extractText(item.role ?? "");
      const duration = extractText(item.duration ?? [item.startDate, item.endDate].filter(Boolean).join(" - "));
      const heading = [`${index + 1}. ${role || "Role"}`, company ? `at ${company}` : "", duration ? `(${duration})` : ""]
        .filter(Boolean)
        .join(" ");
      return heading;
    })
    .filter(Boolean)
    .join("\n");

  const education = Array.isArray(record.education) ? record.education : [];
  const educationText = education
    .map((entry) => {
      const item = asRecord(entry);
      return [extractText(item.institution ?? ""), extractText(item.degree ?? ""), extractText(item.dates ?? "")]
        .filter(Boolean)
        .join(" | ");
    })
    .filter(Boolean)
    .join("\n");

  const certifications = stringList(record.certifications).join(", ");

  const sections = [
    `Resume title: ${resumeTitle}`,
    name ? `Candidate name: ${name}` : "",
    experience ? `Employment history:\n${experience}` : "",
    educationText ? `Education:\n${educationText}` : "",
    certifications ? `Certifications: ${certifications}` : "",
  ].filter(Boolean);

  return sections.join("\n\n");
}

const HUMANIZATION_RULES = [
  "Write the way a real candidate actually talks out loud in an interview, not the way an AI writes a blog post or cover letter.",
  "Never use these AI-tell words or phrases, in any form: delve, leverage, utilize, robust, seamless, seamlessly, showcase, harness, cutting-edge, synergy, foster, elevate, unlock, dive into, in today's fast-paced, furthermore, moreover, additionally, it's worth noting, in conclusion, I am passionate about, I am excited to, at the end of the day, game-changer, streamline.",
  "Use contractions naturally where a person would say them out loud: I've, I'm, didn't, wasn't, that's, it's.",
  "Vary sentence length on purpose. Do not make every sentence the same length or shape — a short sentence right after a longer one is what real speech sounds like.",
  "Do not use a tidy three-item list or perfectly parallel phrasing ('not only... but also', 'X, Y, and Z' triads) — that rhythm is a dead giveaway of AI writing.",
  "Never use em dashes. Use a comma or a period instead.",
  "Lead with something specific and concrete — a real system, a real number, a real decision — fast. Generic language is the single biggest AI tell, not sentence structure.",
].join("\n");

function buildPrompt(input: {
  question: string;
  jobTitle: string;
  company: string;
  jobDescription: string;
  resumeContext: string;
  refineInstruction?: string;
  previousAnswer?: string;
}) {
  if (input.refineInstruction && input.previousAnswer) {
    return [
      HUMANIZATION_RULES,
      "",
      "You are revising a previous interview answer for the same question — you are not writing a new answer from scratch.",
      "Return strict JSON only and nothing else. Do not use markdown fences, code blocks, commentary, or preambles.",
      "Keep everything from the previous answer that already works. Only change what the candidate's instruction below asks you to change.",
      "Stay grounded in the same resume and job context as the previous answer — never introduce a new employer, skill, project, or metric that isn't supported by the resume context.",
      "Keep it in first person, spoken-interview register, not written prose.",
      "",
      "OUTPUT CONTRACT:",
      "answer: the revised interview answer in first person",
      "keyPoints: exactly 2 to 3 short reminders the candidate can reuse while speaking",
      "followUpQuestions: exactly 2 likely follow-up questions the interviewer may ask",
      "",
      `JOB TITLE: ${input.jobTitle || "N/A"}`,
      `COMPANY: ${input.company || "N/A"}`,
      "",
      "RESUME CONTEXT:",
      input.resumeContext || "N/A",
      "",
      "ORIGINAL QUESTION:",
      input.question,
      "",
      "PREVIOUS ANSWER:",
      input.previousAnswer,
      "",
      "CANDIDATE'S REVISION INSTRUCTION:",
      input.refineInstruction,
    ].join("\n");
  }

  return [
    "You are an elite interview coach for senior software engineering candidates.",
    HUMANIZATION_RULES,
    "Return strict JSON only and nothing else.",
    "Do not use markdown fences, code blocks, commentary, or preambles.",
    "Write in the candidate's voice using first person.",
    "The answer must be precise and information-dense: every sentence adds a new fact, decision, or outcome. No throat-clearing, no restating the question, no filler transitions.",
    "Never invent employers, skills, projects, metrics, or responsibilities that are not supported by the resume context.",
    "If the question asks for something not directly evidenced, answer by leaning on adjacent truthful experience and transferable strengths rather than fabricating details.",
    "Use the job context to tailor the answer, but keep the response grounded in the candidate's resume.",
    "Keep the answer short and sharp: 60 to 100 words in 1 tight paragraph. Lead with the direct answer in the first sentence.",
    "The answer should be appropriate for a live interview response, not a bullet list.",
    "If the question is behavioral, structure the response like a compressed STAR answer (situation/action/result in one flowing paragraph) without labeling it.",
    "If the question is technical, name the single most relevant system, decision, or number from the resume context instead of listing several.",
    "Cut every sentence that could be removed without losing a concrete fact.",
    "",
    "OUTPUT CONTRACT:",
    "answer: a short, precise interview answer in first person (60-100 words)",
    "keyPoints: exactly 2 to 3 short reminders the candidate can reuse while speaking",
    "followUpQuestions: exactly 2 likely follow-up questions the interviewer may ask",
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

    // Resume content is never persisted server-side, so the richest context is whatever
    // job-specific structured resume the client already has in memory for this generation.
    // Fall back to the bidder's manager's approved candidate profile when none is supplied.
    const approvedResume = parsed.data.structured
      ? null
      : bidder.managerId
        ? await prisma.resume
            .findFirst({
              where: {
                managerId: bidder.managerId,
                profileStatus: "approved",
              },
              orderBy: {
                updatedAt: "desc",
              },
              select: {
                title: true,
                candidateProfile: true,
              },
            })
            .catch(() => null)
        : null;

    const resolvedJobTitle = parsed.data.jobTitle || application?.jobTitle || "";
    const resolvedCompany = parsed.data.company || application?.company || "";
    const resolvedJobDescription = parsed.data.jobDescription || application?.jobDescription || "";

    const resumeContext = parsed.data.structured
      ? buildResumeContext({
          outputText: null,
          structuredJson: parsed.data.structured as unknown as Prisma.JsonValue,
          resumeTitle: `${resolvedJobTitle || "Tailored"} resume`,
        })
      : approvedResume?.candidateProfile
        ? buildCandidateProfileContext(
            approvedResume.candidateProfile,
            approvedResume.title ||
              `${bidder.manager?.managerProfile?.fullName || bidder.manager?.username || "Latest"} resume`,
          )
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
      temperature: 0.45,
      instructions:
        "You are a professional interview coach for senior software engineers. Return only strict JSON that matches the schema exactly. Answers must sound like a real person talking in an interview, not AI-generated text — short, precise, truthful, with natural varied sentence rhythm and contractions. Every sentence carries a concrete fact grounded in the candidate's resume and job context. No filler, no restating the question, no em dashes, no AI-cliché phrasing.",
      input: buildPrompt({
        question: parsed.data.question,
        jobTitle: resolvedJobTitle,
        company: resolvedCompany,
        jobDescription: resolvedJobDescription,
        resumeContext,
        refineInstruction: parsed.data.refineInstruction,
        previousAnswer: parsed.data.previousAnswer,
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
        action: parsed.data.refineInstruction ? "interview.answer.refined" : "interview.answer.generated",
        details: {
          question: parsed.data.question,
          applicationId: parsed.data.applicationId ?? null,
          jobTitle: resolvedJobTitle || null,
          company: resolvedCompany || null,
          refineInstruction: parsed.data.refineInstruction ?? null,
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
