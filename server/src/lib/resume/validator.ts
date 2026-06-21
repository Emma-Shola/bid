import { normalizeWhitespace } from "./shared";
import { isUsableTailoredText } from "./content-signals";
import { TailoredResumeSchema, type JobAnalysis, type ParsedResume, type TailoredResume } from "./types";

export type TailoringValidationResult = {
  ok: boolean;
  issues: string[];
  warnings: string[];
  sanitized: TailoredResume;
};

function sanitizeTailoredResume(input: TailoredResume): TailoredResume {
  return TailoredResumeSchema.parse({
    summary: normalizeWhitespace(input.summary),
    tailoredSkills: input.tailoredSkills.map((skill) => normalizeWhitespace(skill)).filter(Boolean),
    tailoredExperience: input.tailoredExperience.map((item) => ({
      company: normalizeWhitespace(item.company),
      role: normalizeWhitespace(item.role),
      duration: normalizeWhitespace(item.duration),
      bullets: item.bullets.map((bullet) => normalizeWhitespace(bullet)).filter(Boolean)
    })),
    atsKeywordsUsed: input.atsKeywordsUsed.map((keyword) => normalizeWhitespace(keyword)).filter(Boolean),
    missingKeywords: input.missingKeywords.map((keyword) => normalizeWhitespace(keyword)).filter(Boolean),
    confidenceNotes: input.confidenceNotes.map((note) => normalizeWhitespace(note)).filter(Boolean)
  });
}

function getJdSkills(jobAnalysis?: JobAnalysis) {
  if (!jobAnalysis) {
    return [];
  }

  return Array.from(
    new Set(
      [
        ...jobAnalysis.requiredSkills,
        ...jobAnalysis.preferredSkills,
        ...jobAnalysis.technologies,
        ...jobAnalysis.frameworks,
        ...jobAnalysis.databases,
        ...jobAnalysis.cloudPlatforms,
        ...jobAnalysis.methodologies,
        ...jobAnalysis.tools
      ]
        .map((skill) => normalizeWhitespace(skill))
        .filter(Boolean)
    )
  );
}

function buildFallbackSummary(source: ParsedResume, jobTitle: string, company: string, jobAnalysis?: JobAnalysis) {
  const headline = normalizeWhitespace(source.title || jobTitle || "Experienced software engineer");
  const target = normalizeWhitespace(
    jobTitle
      ? company
        ? `${jobTitle} role at ${company}`
        : `${jobTitle} role`
      : ""
  );

  const skillSample = getJdSkills(jobAnalysis).slice(0, 8);

  const skillsText = skillSample.length > 0 ? `focused on ${skillSample.join(", ")}` : "";
  const domainText = jobAnalysis?.domain ? `for ${jobAnalysis.domain} environments` : "";
  const experienceText = source.experience.length > 0 ? `across ${source.experience.length} career timeline role${source.experience.length === 1 ? "" : "s"}` : "";

  const focus = [skillsText, domainText, experienceText].filter(Boolean).join(", ");
  const targetText = target ? `targeting ${target}` : "targeting the role";
  const body = focus
    ? `${headline} ${targetText}, with generated resume content focused on ${focus}`
    : `${headline} ${targetText}, with generated resume content focused on the job description's core technical requirements`;

  return normalizeWhitespace(`${body}.`) || "Experienced software engineer with a strong background in production systems.";
}

function buildFallbackBullets(input: {
  item: ParsedResume["experience"][number];
  jobTitle: string;
  jobAnalysis?: JobAnalysis;
  isMostRecent: boolean;
}) {
  const skills = getJdSkills(input.jobAnalysis);
  const primarySkills = skills.slice(0, 6);
  const techText = primarySkills.length > 0 ? primarySkills.join(", ") : "modern engineering practices";
  const domain = input.jobAnalysis?.domain || "product";
  const roleLabel = input.item.role || input.jobTitle || "engineering role";

  const bullets = [
    `Architected JD-aligned ${domain} capabilities for ${roleLabel} using ${techText}, improving delivery confidence and creating a stronger match to target platform, product, and operational requirements.`,
    `Optimized application workflows, data handling, and service reliability around ${techText}, reducing implementation risk and positioning the experience around measurable performance, scalability, and maintainability outcomes.`,
    `Delivered production-focused engineering improvements across architecture, automation, testing, and deployment practices, aligning the role with target responsibilities while preserving the original company, title, and employment timeline.`
  ];

  if (input.isMostRecent) {
    bullets.unshift(
      `Led a project-shaped modernization initiative using ${techText} to mirror the target job's core requirements, translating platform goals into scalable services, cleaner delivery workflows, and measurable operational improvements.`
    );
    bullets.push(
      `Established observability, documentation, and repeatable engineering practices around the generated project scope, improving cross-functional visibility, deployment readiness, and long-term maintainability for high-impact product work.`
    );
  }

  return bullets;
}

export function validateTailoredResume(
  source: ParsedResume,
  tailored: TailoredResume
): TailoringValidationResult {
  const sanitized = sanitizeTailoredResume(tailored);
  const issues: string[] = [];
  const warnings: string[] = [];

  const usableSkills = sanitized.tailoredSkills.filter((skill) => isUsableTailoredText(skill));
  const hasUsableSummary = isUsableTailoredText(sanitized.summary);
  const hasUsableExperience = sanitized.tailoredExperience.some((item) =>
    item.bullets.some((bullet) => isUsableTailoredText(bullet))
  );

  if (sanitized.tailoredExperience.length !== source.experience.length) {
    issues.push(
      `Tailored experience item count (${sanitized.tailoredExperience.length}) does not match the source resume (${source.experience.length}); the exporter merges by index, so a mismatch would pair bullets with the wrong role`
    );
  }

  const experienceCount = Math.min(source.experience.length, sanitized.tailoredExperience.length);
  for (let i = 0; i < experienceCount; i++) {
    const sourceItem = source.experience[i];
    const tailoredItem = sanitized.tailoredExperience[i];

    if (tailoredItem.bullets.some((bullet) => !bullet.trim())) {
      warnings.push(`Empty experience bullet found for item ${i + 1}`);
    }

    const sourceHeader = [sourceItem.role, sourceItem.company, sourceItem.duration]
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean)
      .join(" | ");
    const tailoredHeader = [tailoredItem.role, tailoredItem.company, tailoredItem.duration]
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean)
      .join(" | ");

    if (sourceHeader && tailoredHeader && sourceHeader.toLowerCase() !== tailoredHeader.toLowerCase()) {
      warnings.push(`Experience metadata changed for item ${i + 1}; source metadata will be preserved in the exporter`);
    }
  }

  if (!hasUsableSummary && usableSkills.length === 0 && !hasUsableExperience) {
    issues.push("Tailored resume output does not contain usable summary, skills, or experience content");
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    sanitized
  };
}

export function buildFallbackTailoredResume(
  source: ParsedResume,
  jobTitle: string,
  company: string,
  jobAnalysis?: JobAnalysis
): TailoredResume {
  const jdSkills = getJdSkills(jobAnalysis);
  const fallbackSkills =
    jdSkills.length > 0
      ? jdSkills
      : source.title
        ? [source.title]
        : ["Professional experience"];

  return TailoredResumeSchema.parse({
    summary: buildFallbackSummary(source, jobTitle, company, jobAnalysis),
    tailoredSkills: fallbackSkills,
    tailoredExperience: source.experience.map((item, index) => ({
      company: item.company,
      role: item.role,
      duration: item.duration,
      bullets: buildFallbackBullets({
        item,
        jobTitle,
        jobAnalysis,
        isMostRecent: index === 0
      })
    })),
    atsKeywordsUsed: fallbackSkills,
    missingKeywords: [],
    confidenceNotes: ["Used deterministic fallback because the model output could not be validated."]
  });
}
