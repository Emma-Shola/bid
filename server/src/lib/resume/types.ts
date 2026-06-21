import { z } from "zod";

export const ResumeContactSchema = z
  .object({
    email: z.string().trim().optional().default(""),
    phone: z.string().trim().optional().default(""),
    location: z.string().trim().optional().default(""),
    linkedin: z.string().trim().optional().default(""),
    github: z.string().trim().optional().default(""),
    website: z.string().trim().optional().default("")
  })
  .strict();

export const ResumeExperienceSchema = z
  .object({
    company: z.string().trim().default(""),
    role: z.string().trim().default(""),
    duration: z.string().trim().default(""),
    location: z.string().trim().default(""),
    bullets: z.array(z.string().trim().min(1)).default([]),
    rawHeader: z.string().trim().default("")
  })
  .strict();

export const ResumeEducationSchema = z
  .object({
    school: z.string().trim().default(""),
    degree: z.string().trim().default(""),
    duration: z.string().trim().default(""),
    location: z.string().trim().default(""),
    details: z.array(z.string().trim().min(1)).default([]),
    rawLine: z.string().trim().default("")
  })
  .strict();

export const ResumeSkillCategorySchema = z
  .object({
    category: z.string().trim().default(""),
    skills: z.array(z.string().trim().min(1)).default([])
  })
  .strict();

export const ParsedResumeSchema = z
  .object({
    name: z.string().trim().default(""),
    title: z.string().trim().default(""),
    summary: z.string().trim().default(""),
    skills: z.array(z.string().trim().min(1)).default([]),
    skillCategories: z.array(ResumeSkillCategorySchema).default([]),
    experience: z.array(ResumeExperienceSchema).default([]),
    education: z.array(ResumeEducationSchema).default([]),
    certificates: z.array(z.string().trim().min(1)).default([]),
    contact: ResumeContactSchema.optional().default({}),
    sourceMeta: z
      .object({
        parserVersion: z.string().default("1.0"),
        fileType: z.string().default("extracted-text"),
        confidence: z.number().min(0).max(1).default(0.5)
      })
      .strict()
      .default({
        parserVersion: "1.0",
        fileType: "extracted-text",
        confidence: 0.5
      })
  })
  .strict();

export const JobAnalysisSchema = z
  .object({
    title: z.string().trim().default(""),
    company: z.string().trim().default(""),
    domain: z.string().trim().default(""),
    seniority: z.enum(["junior", "mid", "senior", "staff", "principal"]).default("mid"),
    keywords: z.array(z.string().trim().min(1)).default([]),
    mustHaveSkills: z.array(z.string().trim().min(1)).default([]),
    niceToHaveSkills: z.array(z.string().trim().min(1)).default([]),
    requiredSkills: z.array(z.string().trim().min(1)).default([]),
    preferredSkills: z.array(z.string().trim().min(1)).default([]),
    technologies: z.array(z.string().trim().min(1)).default([]),
    frameworks: z.array(z.string().trim().min(1)).default([]),
    databases: z.array(z.string().trim().min(1)).default([]),
    cloudPlatforms: z.array(z.string().trim().min(1)).default([]),
    methodologies: z.array(z.string().trim().min(1)).default([]),
    tools: z.array(z.string().trim().min(1)).default([]),
    responsibilities: z.array(z.string().trim().min(1)).default([]),
    domainKeywords: z.array(z.string().trim().min(1)).default([])
  })
  .strict();

export const TailoredExperienceSchema = z
  .object({
    company: z.string().trim(),
    role: z.string().trim(),
    duration: z.string().trim(),
    bullets: z.array(z.string().trim().min(1))
  })
  .strict();

export const TailoredResumeSchema = z
  .object({
    summary: z.string().trim(),
    tailoredSkills: z.array(z.string().trim().min(1)),
    tailoredExperience: z.array(TailoredExperienceSchema),
    atsKeywordsUsed: z.array(z.string().trim().min(1)),
    missingKeywords: z.array(z.string().trim().min(1)),
    confidenceNotes: z.array(z.string().trim().min(1))
  })
  .strict();

export type ResumeContact = z.infer<typeof ResumeContactSchema>;
export type ResumeExperience = z.infer<typeof ResumeExperienceSchema>;
export type ResumeEducation = z.infer<typeof ResumeEducationSchema>;
export type ResumeSkillCategory = z.infer<typeof ResumeSkillCategorySchema>;
export type ParsedResume = z.infer<typeof ParsedResumeSchema>;
export type JobAnalysis = z.infer<typeof JobAnalysisSchema>;
export type TailoredExperience = z.infer<typeof TailoredExperienceSchema>;
export type TailoredResume = z.infer<typeof TailoredResumeSchema>;
