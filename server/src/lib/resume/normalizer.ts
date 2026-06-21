import { dedupeStrings, normalizeKeyword, normalizeWhitespace } from "./shared";
import { ParsedResumeSchema, type JobAnalysis, type ParsedResume, type ResumeSkillCategory } from "./types";

function normalizeDuration(value: string) {
  return normalizeWhitespace(value).replace(/\s*[–—]\s*/g, " - ");
}

function normalizeContactField(value: string) {
  return normalizeWhitespace(value);
}

function normalizeTitleCaseFallback(value: string) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return "";
  return trimmed;
}

function normalizeSkillCategories(categories: ResumeSkillCategory[]) {
  const seen = new Set<string>();

  return categories
    .map((category) => ({
      category: normalizeWhitespace(category.category),
      skills: dedupeStrings(category.skills.map((skill) => normalizeWhitespace(skill)))
    }))
    .filter((category) => category.category || category.skills.length > 0)
    .filter((category) => {
      const key = category.category.toLowerCase();
      if (!key) {
        return category.skills.length > 0;
      }

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

export function normalizeParsedResume(input: ParsedResume, fallbackName = ""): ParsedResume {
  const parsed = ParsedResumeSchema.parse(input);
  const name = normalizeTitleCaseFallback(parsed.name || fallbackName);
  const title = normalizeWhitespace(parsed.title);
  const summary = normalizeWhitespace(parsed.summary);
  const skillCategories = normalizeSkillCategories(parsed.skillCategories);
  const skillSource =
    skillCategories.length > 0
      ? [...skillCategories.flatMap((category) => category.skills), ...parsed.skills]
      : parsed.skills;
  const skills = dedupeStrings(skillSource.map((skill) => normalizeWhitespace(skill)));

  const experience = parsed.experience.map((item) => ({
    company: normalizeWhitespace(item.company),
    role: normalizeWhitespace(item.role),
    duration: normalizeDuration(item.duration),
    location: normalizeWhitespace(item.location),
    bullets: dedupeStrings(item.bullets.map((bullet) => normalizeWhitespace(bullet))),
    rawHeader: normalizeWhitespace(item.rawHeader)
  }));

  const education = parsed.education.map((item) => ({
    school: normalizeWhitespace(item.school),
    degree: normalizeWhitespace(item.degree),
    duration: normalizeDuration(item.duration),
    location: normalizeWhitespace(item.location),
    details: dedupeStrings(item.details.map((detail) => normalizeWhitespace(detail))),
    rawLine: normalizeWhitespace(item.rawLine)
  }));

  const certificates = dedupeStrings(parsed.certificates.map((certificate) => normalizeWhitespace(certificate)));

  return ParsedResumeSchema.parse({
    ...parsed,
    name,
    title,
    summary,
    skills,
    skillCategories,
    experience,
    education,
    certificates,
    contact: {
      email: normalizeContactField(parsed.contact?.email || ""),
      phone: normalizeContactField(parsed.contact?.phone || ""),
      location: normalizeContactField(parsed.contact?.location || ""),
      linkedin: normalizeContactField(parsed.contact?.linkedin || ""),
      github: normalizeContactField(parsed.contact?.github || ""),
      website: normalizeContactField(parsed.contact?.website || "")
    }
  });
}

export function normalizeJobAnalysis(input: JobAnalysis): JobAnalysis {
  const keywords = dedupeStrings(
    input.keywords
      .map((keyword) => normalizeKeyword(keyword))
      .filter(Boolean)
  );
  const cleanList = (values: string[]) => dedupeStrings(values.map((value) => normalizeWhitespace(value)).filter(Boolean));

  return {
    title: normalizeWhitespace(input.title),
    company: normalizeWhitespace(input.company),
    domain: normalizeWhitespace(input.domain),
    seniority: input.seniority,
    keywords,
    mustHaveSkills: cleanList(input.mustHaveSkills),
    niceToHaveSkills: cleanList(input.niceToHaveSkills),
    requiredSkills: cleanList(input.requiredSkills),
    preferredSkills: cleanList(input.preferredSkills),
    technologies: cleanList(input.technologies),
    frameworks: cleanList(input.frameworks),
    databases: cleanList(input.databases),
    cloudPlatforms: cleanList(input.cloudPlatforms),
    methodologies: cleanList(input.methodologies),
    tools: cleanList(input.tools),
    responsibilities: cleanList(input.responsibilities),
    domainKeywords: cleanList(input.domainKeywords)
  };
}



