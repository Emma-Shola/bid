import { normalizeWhitespace } from "./shared";
import { ParsedResumeSchema, type ParsedResume } from "./types";

export function buildProfileSkeleton(input: {
  source: ParsedResume;
  targetTitle?: string;
}): ParsedResume {
  const source = input.source;

  return ParsedResumeSchema.parse({
    ...source,
    // The uploaded resume owns identity/timeline, but the resume headline should
    // face the target role instead of leaking the candidate's old/current title.
    title: normalizeWhitespace(input.targetTitle || source.title),
    summary: "",
    skills: [],
    skillCategories: [],
    experience: source.experience.map((item) => ({
      company: normalizeWhitespace(item.company),
      role: normalizeWhitespace(item.role),
      duration: normalizeWhitespace(item.duration),
      location: normalizeWhitespace(item.location),
      bullets: [],
      rawHeader: normalizeWhitespace(item.rawHeader)
    })),
    education: source.education.map((item) => ({
      school: normalizeWhitespace(item.school),
      degree: normalizeWhitespace(item.degree),
      duration: normalizeWhitespace(item.duration),
      location: normalizeWhitespace(item.location),
      details: item.details.map((detail) => normalizeWhitespace(detail)).filter(Boolean),
      rawLine: normalizeWhitespace(item.rawLine)
    })),
    certificates: source.certificates.map((certificate) => normalizeWhitespace(certificate)).filter(Boolean)
  });
}
