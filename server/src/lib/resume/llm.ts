import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { DEFAULT_RESUME_MODEL } from "./config";
import { TailoredResumeSchema, type JobAnalysis, type ParsedResume } from "./types";
import { normalizeWhitespace } from "./shared";
import { type ResumeGapAnalysis } from "./gap-analysis";

let client: OpenAI | null = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  client ??= new OpenAI({ apiKey });
  return client;
}

export function getResumeGenerationModel() {
  return process.env.OPENAI_RESUME_MODEL || DEFAULT_RESUME_MODEL;
}

function buildPrompt(input: {
  source: ParsedResume;
  jobAnalysis: JobAnalysis;
  gapAnalysis: ResumeGapAnalysis;
  resumeRulesText?: string;
}) {
  return [
    "You are an elite ATS resume transformation engine.",
    "Return strict JSON only and nothing else.",
    "Do not create markdown, code fences, commentary, or explanations.",
    "The input resume is a PROFILE SKELETON, not the primary content source.",
    "The skeleton only provides name, contact information, employment history, company names, job titles, employment dates, location, education, and existing certifications.",
    "The uploaded resume's original summary, skills, projects, and experience bullets are disposable and must not be reused.",
    "The job description is the primary optimization target and determines the generated resume content.",
    "Generate a new headline through the summary language, a new summary, a new skills section, new project-shaped descriptions, and new experience bullets.",
    "Preserve every source experience item, company, role, duration, and location exactly as the career timeline container.",
    "Preserve education and existing certifications only. Never generate certifications or certificate language.",
    "Every important JD technology must appear naturally in tailoredSkills, the summary, the most recent role bullets, and the most recent role's project-shaped achievement cluster.",
    "The most recent role must contain a project aligned with the JD technologies, JD responsibilities, and JD business domain without copying the JD verbatim.",
    "The final resume should read as if it was originally written for the target job.",
    "SUMMARY WRITING RULES — READ CAREFULLY:",
    "Write one paragraph of 3 to 4 sentences, 110 to 160 words. No bullets. No markdown.",
    "The summary must read like a recruiter who just interviewed this candidate is introducing them: confident, career-specific, human.",
    "SENTENCE 1 — Career story opener. Answer: what has this person spent their career doing? Lead with years of experience and the nature of the work. Example structure: 'Software engineer with X years designing and operating [type of systems] for [type of companies]...' — never open with a job title, seniority label, or technology list.",
    "SENTENCE 2 — What was built or delivered. Describe the systems, products, or operational improvements this person has owned. Bring in the JD domain naturally here — not as a keyword, as context for what they built.",
    "SENTENCE 3 or 4 — Technical depth in context. Describe technical strengths by explaining how they were applied: '...using AWS and infrastructure automation to improve deployment reliability' not 'AWS, Kubernetes, Terraform'. Technologies should appear as part of a sentence describing work, never as a comma-separated list.",
    "HARD RULES FOR THE SUMMARY:",
    "- NO PRONOUNS ANYWHERE IN THE SUMMARY. Never write 'he', 'she', 'they', 'his', 'her', 'their', 'He has', 'She has', 'They have'. Resumes are written in implied first-person with no subject. Write 'Has led teams...' not 'He has led teams...'. Write 'Brings deep experience...' not 'He brings...'. This is the single most important rule — a pronoun in a resume summary immediately signals AI generation.",
    "- FORBIDDEN openers — never begin with: the exact target job title ('Staff Software Engineer...', 'Senior Backend Engineer...', 'Principal Engineer...'), the word 'Specializing', or a technology list.",
    "- ALLOWED openers — begin with years of experience and what the person has built: 'Software engineer with 10 years designing...', 'Backend engineer who has spent a decade building...', 'Engineering lead with 12 years delivering...'",
    "- NEVER list technologies as a comma-separated sequence anywhere in the summary. Technologies must appear embedded in sentences that describe work: '...building payment systems using TypeScript and PostgreSQL' not 'TypeScript, Python, Java, Go, SQL, PostgreSQL'.",
    "- DO NOT mirror the job description. A recruiter reading the summary and the JD side-by-side should not see obvious phrase overlap.",
    "- DO NOT use hollow filler: 'passionate about', 'detail-oriented', 'strong team player', 'proven track record', 'results-driven'.",
    "- ATS keywords must be invisible — woven into real sentences about real work.",
    "- The JD refines the framing; it does not replace the candidate's career identity.",
    "- Prefer concrete nouns: systems built, scale numbers, products shipped, improvements made.",
    "Generate technical skills directly from the JD. Include all important JD technologies, frameworks, programming languages, databases, cloud platforms, DevOps tools, methodologies, responsibilities, and ATS keywords.",
    "Organize tailoredSkills as compact category strings, for example: Languages: Python, TypeScript, SQL.",
    "For the most recent role, create a project-shaped achievement cluster that aligns strongly with the JD responsibilities, using JD technologies, realistic engineering scope, and measurable business outcomes.",
    "The most recent role should feel intentionally built for the target job: architecture, implementation, scale, reliability, performance, product impact, and operational ownership should be visible.",
    "Do not keep generic summary language or weak skill ordering. The JD must drive the generated content.",
    "Do not invent employers, dates, metrics, degrees, or certifications.",
    "Do not add a Certifications section, certificates, or certificate-related language unless the source resume explicitly contains a real certificates or certifications section with actual items.",
    "For skills, technologies, project content, and bullets, optimize from the JD. For identity, timeline, education, and certifications, preserve the skeleton.",
    "Experience bullets must read like accomplishments, not tasks, and should sound like a high-performing senior engineer documenting achievements.",
    "Every experience bullet must be 30 to 60 words and follow this structure: Technical Challenge -> Action Taken -> Technologies Used -> Business or Technical Outcome -> Metric or Measurable Result.",
    "Never use these patterns: X required Y, so I..., To support..., Needed to..., Required..., Was responsible for..., Worked on..., Helped..., Participated in..., Collaborated with....",
    "Start bullets with strong action verbs such as Architected, Designed, Led, Optimized, Reduced, Automated, Migrated, Implemented, Scaled, Modernized, Accelerated, Consolidated, Streamlined, or Delivered.",
    "Prefer achievements over responsibilities at an 80/20 ratio.",
    "Bullets should demonstrate ownership, architecture, scalability, performance, reliability, security, automation, cloud infrastructure, observability, and developer productivity.",
    "Bring job-description technologies forward wherever they improve ATS alignment.",
    "At least 70 percent of bullets should contain believable metrics.",
    "Use realistic, believable metrics when needed.",
    "Avoid repeating technologies unnecessarily across bullets.",
    "Vary sentence structure so bullets do not all read the same.",
    "Do not write generic ATS filler.",
    "Before writing each bullet, ensure it would impress a hiring manager at Google, Stripe, Meta, Datadog, Snowflake, Airbnb, or Amazon.",
    "",
    "OUTPUT CONTRACT:",
    "summary: a newly generated target-role resume summary based on the JD",
    "tailoredSkills: JD-generated category strings ordered by ATS relevance",
    "tailoredExperience: same length as the profile skeleton experience list; each item must include company, role, duration, and newly generated JD-aligned bullets",
    "atsKeywordsUsed: keywords from the job description that are used in the output",
    "missingKeywords: keywords from the job description that were not used",
    "confidenceNotes: short notes about generated JD alignment and preserved career timeline",
    "",
    "TARGET BULLET COUNTS:",
    JSON.stringify(input.source.experience.map((_, index) => index === 0 ? "5-7 JD-aligned bullets with one project-shaped cluster" : "3-5 JD-aligned bullets")),
    "",
    "ADMIN-APPROVED RESUME RULES TXT:",
    input.resumeRulesText?.trim() || "No additional admin rules were provided.",
    "",
    "GAP ANALYSIS JSON:",
    JSON.stringify(input.gapAnalysis),
    "",
    "PROFILE SKELETON JSON:",
    JSON.stringify(input.source),
    "",
    "JOB ANALYSIS JSON:",
    JSON.stringify(input.jobAnalysis)
  ].join("\n");
}

function buildRepairPrompt(input: {
  source: ParsedResume;
  jobAnalysis: JobAnalysis;
  gapAnalysis: ResumeGapAnalysis;
  previousOutput: string;
  issues: string[];
  resumeRulesText?: string;
}) {
  return [
    "Your previous JSON was invalid for production use.",
    "Return strict JSON only and nothing else.",
    "Preserve only the profile skeleton timeline: name, contact, company names, roles, dates, education, and existing certifications.",
    "Do not reuse uploaded summary, uploaded skills, uploaded project descriptions, or uploaded bullets.",
    "Use the supplied gap analysis and job analysis to regenerate JD-first summary, skills, project-shaped content, and experience bullets.",
    "Every important JD technology should appear in tailoredSkills and naturally in the most recent role.",
    "Rewrite the summary as a career story, not a JD keyword list. It must read like a recruiter describing this candidate after an interview.",
    "Keep it to one paragraph of 3 to 4 sentences. Open with years of experience and what this person has built over their career. Introduce technologies in the context of work done, never as a comma-separated list.",
    "ABSOLUTELY FORBIDDEN in the summary: pronouns of any kind ('he', 'she', 'they', 'his', 'her', 'their' — resumes use implied first-person with no subject), opening with a job title or seniority label, technology lists ('TypeScript, Python, Java, Go'), JD language copied verbatim, filler phrases.",
    "Do not add markdown fences, explanations, or commentary.",
    "",
    "VALIDATION ISSUES:",
    JSON.stringify(input.issues),
    "",
    "ADMIN-APPROVED RESUME RULES TXT:",
    input.resumeRulesText?.trim() || "No additional admin rules were provided.",
    "",
    "PREVIOUS OUTPUT:",
    input.previousOutput,
    "",
    "PROFILE SKELETON JSON:",
    JSON.stringify(input.source),
    "",
    "JOB ANALYSIS JSON:",
    JSON.stringify(input.jobAnalysis),
    "",
    "GAP ANALYSIS JSON:",
    JSON.stringify(input.gapAnalysis)
  ].join("\n");
}

export function parseTailoredResumeOutput(raw: string) {
  const cleaned = normalizeWhitespace(raw)
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  return TailoredResumeSchema.parse(JSON.parse(cleaned));
}

async function runTailoringAttempt(input: {
  source: ParsedResume;
  jobAnalysis: JobAnalysis;
  gapAnalysis: ResumeGapAnalysis;
  resumeRulesText?: string;
}) {
  const openai = getClient();
  if (!openai) {
    throw new Error("OPENAI_API_KEY is required for resume generation");
  }

  const response = await openai.responses.create({
    model: getResumeGenerationModel(),
    temperature: 0,
    instructions:
    "You are a professional resume writer who produces senior-level resumes that sound like they were written by a human, not generated by AI. Return only strict JSON that matches the schema exactly. The summary must tell a career story — experience first, technologies woven naturally into context, never listed as keywords. Experience bullets must read as achievements with ownership and outcomes. The result must pass a recruiter's sniff test: it should not look AI-generated.",
    input: buildPrompt({
      source: input.source,
      jobAnalysis: input.jobAnalysis,
      gapAnalysis: input.gapAnalysis,
      resumeRulesText: input.resumeRulesText
    }),
    text: {
      format: zodTextFormat(TailoredResumeSchema, "tailored_resume")
    }
  });

  const rawText = normalizeWhitespace(response.output_text || "");
  if (!rawText) {
    throw new Error("OpenAI returned an empty response");
  }

  return rawText;
}

async function runRepairAttempt(input: {
  source: ParsedResume;
  jobAnalysis: JobAnalysis;
  gapAnalysis: ResumeGapAnalysis;
  previousOutput: string;
  issues: string[];
  resumeRulesText?: string;
}) {
  const openai = getClient();
  if (!openai) {
    throw new Error("OPENAI_API_KEY is required for resume generation");
  }

  const response = await openai.responses.create({
    model: getResumeGenerationModel(),
    temperature: 0,
    instructions:
    "You are a professional resume writer producing senior-level resumes that sound human, not AI-generated. Return only strict JSON. Fix the validation issues in the previous output while keeping the summary as a natural career story and bullets as achievement statements.",
    input: buildRepairPrompt({
      source: input.source,
      jobAnalysis: input.jobAnalysis,
      gapAnalysis: input.gapAnalysis,
      previousOutput: input.previousOutput,
      issues: input.issues,
      resumeRulesText: input.resumeRulesText
    }),
    text: {
      format: zodTextFormat(TailoredResumeSchema, "tailored_resume")
    }
  });

  const rawText = normalizeWhitespace(response.output_text || "");
  if (!rawText) {
    throw new Error("OpenAI returned an empty repair response");
  }

  return rawText;
}

export async function tailorResumeRawWithRetry(input: {
  source: ParsedResume;
  jobAnalysis: JobAnalysis;
  gapAnalysis: ResumeGapAnalysis;
  resumeRulesText?: string;
}) {
  try {
    return await runTailoringAttempt(input);
  } catch (firstError) {
    const firstOutput = firstError instanceof Error ? firstError.message : "Unknown model error";
    const secondAttempt = await runRepairAttempt({
      source: input.source,
      jobAnalysis: input.jobAnalysis,
      gapAnalysis: input.gapAnalysis,
      previousOutput: firstOutput,
      issues: [firstOutput],
      resumeRulesText: input.resumeRulesText
    }).catch(() => null);

    if (secondAttempt) {
      return secondAttempt;
    }

    throw firstError;
  }
}

export async function repairTailoredResumeRaw(input: {
  source: ParsedResume;
  jobAnalysis: JobAnalysis;
  gapAnalysis: ResumeGapAnalysis;
  previousOutput: string;
  issues: string[];
  resumeRulesText?: string;
}) {
  return runRepairAttempt(input);
}
