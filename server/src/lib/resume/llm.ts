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
    "Write the summary as one dense paragraph or 3 to 4 compact sentences, roughly 110 to 170 words, with no bullets and no markdown.",
    "Start with the target role and seniority, then weave in the JD domain, JD technologies, system ownership, scale, delivery responsibility, and business or technical outcomes.",
    "Use JD keywords naturally and aggressively while keeping the language human and recruiter-friendly.",
    "Avoid generic language that could fit any engineer, such as weak filler about being detail-oriented, passionate, or a strong team player unless it is grounded in stronger technical detail.",
    "Prefer concrete nouns, systems, scale, and outcomes over vague adjectives.",
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
}) {
  return [
    "Your previous JSON was invalid for production use.",
    "Return strict JSON only and nothing else.",
    "Preserve only the profile skeleton timeline: name, contact, company names, roles, dates, education, and existing certifications.",
    "Do not reuse uploaded summary, uploaded skills, uploaded project descriptions, or uploaded bullets.",
    "Use the supplied gap analysis and job analysis to regenerate JD-first summary, skills, project-shaped content, and experience bullets.",
    "Every important JD technology should appear in tailoredSkills and naturally in the most recent role.",
    "Rewrite the summary so it is dense, technical, specific, and clearly built for the target job description.",
    "Keep the summary to one compact paragraph or 3 to 4 sentences and make sure it reflects the target role, domain, JD technologies, scale, and outcomes.",
    "Do not add markdown fences, explanations, or commentary.",
    "",
    "VALIDATION ISSUES:",
    JSON.stringify(input.issues),
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
}) {
  const openai = getClient();
  if (!openai) {
    throw new Error("OPENAI_API_KEY is required for resume generation");
  }

  const response = await openai.responses.create({
    model: getResumeGenerationModel(),
    temperature: 0,
    instructions:
    "You are a professional ATS resume transformation engine. Return only strict JSON that matches the schema exactly. Use the job description and gap analysis to maximize truthful ATS alignment, keep skills ordered by relevance, and make experience bullets achievement-driven and recruiter-grade.",
    input: buildPrompt({ source: input.source, jobAnalysis: input.jobAnalysis, gapAnalysis: input.gapAnalysis }),
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
}) {
  const openai = getClient();
  if (!openai) {
    throw new Error("OPENAI_API_KEY is required for resume generation");
  }

  const response = await openai.responses.create({
    model: getResumeGenerationModel(),
    temperature: 0,
    instructions:
    "You are a professional ATS resume transformation engine. Return only strict JSON that matches the schema exactly. Use the gap analysis to maximize truthful ATS alignment and keep experience bullets achievement-driven and recruiter-grade.",
    input: buildRepairPrompt({
      source: input.source,
      jobAnalysis: input.jobAnalysis,
      gapAnalysis: input.gapAnalysis,
      previousOutput: input.previousOutput,
      issues: input.issues
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
      issues: [firstOutput]
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
}) {
  return runRepairAttempt(input);
}
