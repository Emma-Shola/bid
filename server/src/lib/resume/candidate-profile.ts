import { createHash } from "crypto";
import { z } from "zod";
import { normalizeParsedResume } from "./normalizer";
import { parseResumeText } from "./parser";
import { dedupeStrings, normalizeWhitespace } from "./shared";
import { ParsedResumeSchema, type ParsedResume, type ResumeEducation, type ResumeExperience } from "./types";

export const CANDIDATE_PROFILE_VERSION = "candidate-profile-v1";

export const CandidateProfileSchema = z.object({
  version: z.string().default(CANDIDATE_PROFILE_VERSION),
  personalInfo: z
    .object({
      name: z.string().trim().default(""),
      email: z.string().trim().default(""),
      phone: z.string().trim().default(""),
      location: z.string().trim().default(""),
      linkedin: z.string().trim().default(""),
      github: z.string().trim().default(""),
      website: z.string().trim().default("")
    })
    .passthrough(),
  employmentHistory: z
    .array(
      z
        .object({
          company: z.string().trim().default(""),
          role: z.string().trim().default(""),
          startDate: z.string().trim().default(""),
          endDate: z.string().trim().default(""),
          duration: z.string().trim().default(""),
          location: z.string().trim().default("")
        })
        .passthrough()
    )
    .default([]),
  education: z
    .array(
      z
        .object({
          institution: z.string().trim().default(""),
          degree: z.string().trim().default(""),
          dates: z.string().trim().default(""),
          location: z.string().trim().default(""),
          details: z.array(z.string().trim().min(1)).default([])
        })
        .passthrough()
    )
    .default([]),
  certifications: z.array(z.string().trim().min(1)).default([]),
  sourceAudit: z
    .object({
      textHash: z.string().trim().default(""),
      textLength: z.number().int().nonnegative().default(0),
      parserVersion: z.string().trim().default(""),
      confidence: z.number().min(0).max(1).default(0)
    })
    .passthrough()
    .default({
      textHash: "",
      textLength: 0,
      parserVersion: "",
      confidence: 0
    })
})
.passthrough();

export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

function textHash(value: string) {
  return createHash("sha256").update(value || "").digest("hex");
}

function splitDuration(duration: string) {
  const normalized = normalizeWhitespace(duration);
  if (!normalized) {
    return { startDate: "", endDate: "" };
  }

  const parts = normalized
    .split(/\s+(?:-|–|—|to)\s+/i)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      startDate: parts[0],
      endDate: parts.slice(1).join(" - ")
    };
  }

  return {
    startDate: "",
    endDate: normalized
  };
}

function profileExperienceFromParsed(item: ResumeExperience) {
  const duration = normalizeWhitespace(item.duration);
  const split = splitDuration(duration);

  return {
    company: normalizeWhitespace(item.company),
    role: normalizeWhitespace(item.role),
    startDate: split.startDate,
    endDate: split.endDate,
    duration,
    location: normalizeWhitespace(item.location)
  };
}

function profileEducationFromParsed(item: ResumeEducation) {
  return {
    institution: normalizeWhitespace(item.school),
    degree: normalizeWhitespace(item.degree),
    dates: normalizeWhitespace(item.duration),
    location: normalizeWhitespace(item.location),
    details: dedupeStrings(item.details.map((detail) => normalizeWhitespace(detail)).filter(Boolean))
  };
}

export function buildCandidateProfileFromParsed(input: {
  parsed: ParsedResume;
  sourceText?: string;
}): CandidateProfile {
  const sourceText = input.sourceText || "";
  const parsed = normalizeParsedResume(input.parsed, input.parsed.name);

  return CandidateProfileSchema.parse({
    version: CANDIDATE_PROFILE_VERSION,
    personalInfo: {
      name: parsed.name,
      email: parsed.contact.email,
      phone: parsed.contact.phone,
      location: parsed.contact.location,
      linkedin: parsed.contact.linkedin,
      github: parsed.contact.github,
      website: parsed.contact.website
    },
    employmentHistory: parsed.experience
      .map(profileExperienceFromParsed)
      .filter((item) => item.company || item.role || item.duration),
    education: parsed.education
      .map(profileEducationFromParsed)
      .filter((item) => item.institution || item.degree || item.dates),
    certifications: dedupeStrings(parsed.certificates.map((item) => normalizeWhitespace(item)).filter(Boolean)),
    sourceAudit: {
      textHash: textHash(sourceText),
      textLength: sourceText.length,
      parserVersion: parsed.sourceMeta.parserVersion,
      confidence: parsed.sourceMeta.confidence
    }
  });
}

export function buildCandidateProfileFromText(input: {
  text: string;
  fileType?: string;
  candidateName?: string;
}) {
  const sourceText = normalizeWhitespace(input.text);
  const parsed = normalizeParsedResume(
    parseResumeText({
      text: sourceText,
      fileType: input.fileType,
      candidateName: input.candidateName
    }),
    input.candidateName || ""
  );

  return {
    parsed,
    profile: buildCandidateProfileFromParsed({
      parsed,
      sourceText
    })
  };
}

export function candidateProfileToParsedResume(profileInput: unknown, targetTitle = ""): ParsedResume {
  const profile = CandidateProfileSchema.parse(profileInput);
  const experience = profile.employmentHistory.map((item) => ({
    company: normalizeWhitespace(item.company),
    role: normalizeWhitespace(item.role),
    duration: normalizeWhitespace(item.duration || [item.startDate, item.endDate].filter(Boolean).join(" - ")),
    location: normalizeWhitespace(item.location),
    bullets: [],
    rawHeader: [item.role, item.company, item.duration || [item.startDate, item.endDate].filter(Boolean).join(" - "), item.location]
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean)
      .join(" | ")
  }));

  const education = profile.education.map((item) => ({
    school: normalizeWhitespace(item.institution),
    degree: normalizeWhitespace(item.degree),
    duration: normalizeWhitespace(item.dates),
    location: normalizeWhitespace(item.location),
    details: dedupeStrings(item.details.map((detail) => normalizeWhitespace(detail)).filter(Boolean)),
    rawLine: [item.institution, item.degree, item.dates, item.location]
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean)
      .join(" | ")
  }));

  return ParsedResumeSchema.parse({
    name: profile.personalInfo.name,
    title: targetTitle,
    summary: "",
    skills: [],
    skillCategories: [],
    experience,
    education,
    certificates: profile.certifications,
    contact: {
      email: profile.personalInfo.email,
      phone: profile.personalInfo.phone,
      location: profile.personalInfo.location,
      linkedin: profile.personalInfo.linkedin,
      github: profile.personalInfo.github,
      website: profile.personalInfo.website
    },
    sourceMeta: {
      parserVersion: CANDIDATE_PROFILE_VERSION,
      fileType: "candidate-profile",
      confidence: profile.sourceAudit.confidence || 1
    }
  });
}

export function buildResumeRulesText(profileInput: unknown) {
  const profile = CandidateProfileSchema.parse(profileInput);
  const identityLines = [
    `Name: ${profile.personalInfo.name}`,
    `Email: ${profile.personalInfo.email}`,
    `Phone: ${profile.personalInfo.phone}`,
    `Location: ${profile.personalInfo.location}`,
    `LinkedIn: ${profile.personalInfo.linkedin}`,
    `GitHub: ${profile.personalInfo.github}`,
    `Website: ${profile.personalInfo.website}`
  ].filter((line) => !line.endsWith(": "));

  const workLines = profile.employmentHistory.map((item, index) => {
    const duration = item.duration || [item.startDate, item.endDate].filter(Boolean).join(" - ");
    return `${index + 1}. ${item.role} | ${item.company} | ${duration}${item.location ? ` | ${item.location}` : ""}`;
  });

  const educationLines = profile.education.map((item, index) => {
    return `${index + 1}. ${item.institution}${item.degree ? ` | ${item.degree}` : ""}${item.dates ? ` | ${item.dates}` : ""}${item.location ? ` | ${item.location}` : ""}`;
  });

  const certificateLines = profile.certifications.length > 0
    ? profile.certifications.map((certificate, index) => `${index + 1}. ${certificate}`)
    : ["None found in source profile."];

  return [
    "TOPBRASS RESUME GENERATION RULES",
    "",
    "SOURCE OF TRUTH",
    "Use this TXT and the Candidate Profile JSON as the only source of fixed candidate facts.",
    "Do not re-parse the original PDF during resume generation.",
    "",
    "PRESERVE EXACTLY",
    ...identityLines.map((line) => `- ${line}`),
    "- Company names",
    "- Job titles",
    "- Employment dates",
    "- Education institutions",
    "- Degrees",
    "- Existing certifications only",
    "",
    "CAREER TIMELINE",
    ...workLines.map((line) => `- ${line}`),
    "",
    "EDUCATION",
    ...educationLines.map((line) => `- ${line}`),
    "",
    "CERTIFICATIONS",
    ...certificateLines.map((line) => `- ${line}`),
    "",
    "GENERATE FRESH FOR EVERY JOB DESCRIPTION",
    "- Target headline",
    "- Professional summary",
    "- Technical skills",
    "- Project-shaped achievements",
    "- Experience bullets",
    "",
    "JOB DESCRIPTION OPTIMIZATION RULES",
    "- Treat the job description as the primary optimization target.",
    "- Extract technologies, frameworks, databases, cloud platforms, tools, responsibilities, methodologies, and ATS keywords from the job description.",
    "- Build the skills section from the job description and order it by relevance.",
    "- Include important job-description technologies naturally in the summary, skills, most recent project, and experience bullets.",
    "- Make the resume look specifically built for the target role while preserving the fixed timeline above.",
    "- Generate project-shaped achievements for the most recent role based on the job description domain and responsibilities.",
    "- Use realistic engineering scope, business outcomes, and metrics.",
    "",
    "CERTIFICATE RULE",
    "- Render certifications only if they exist in the Certifications list above.",
    "- Never invent certifications, licenses, credentials, degrees, schools, employers, job titles, or employment dates.",
    "",
    "OUTPUT RULES",
    "- Return strict structured resume JSON only.",
    "- Do not output markdown as the final resume.",
    "- Presentation is handled by the deterministic PDF/DOCX renderer."
  ].join("\n");
}

