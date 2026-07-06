import { z } from "zod";

export const ManagerGenerationRulesSchema = z
  .object({
    minAtsScore: z.number().min(0).max(100).optional(),
    maxGenerationAttempts: z.number().int().min(1).max(5).optional(),
    filenameIncludesCandidateName: z.boolean().optional(),
    groupDownloadsByCompanyFolder: z.boolean().optional(),
    duplicateCompanyCooldownDays: z.number().int().min(1).max(365).optional()
  })
  .strict();

export type ManagerGenerationRules = z.infer<typeof ManagerGenerationRulesSchema>;

export function parseManagerGenerationRules(raw: unknown): ManagerGenerationRules {
  const parsed = ManagerGenerationRulesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

export const AppliedCompanyEntrySchema = z.object({
  company: z.string().trim().min(1).max(255),
  appliedAt: z.string()
});

export type AppliedCompanyEntry = z.infer<typeof AppliedCompanyEntrySchema>;

export function parseAppliedCompanies(raw: unknown): AppliedCompanyEntry[] {
  const parsed = z.array(AppliedCompanyEntrySchema).safeParse(raw ?? []);
  return parsed.success ? parsed.data : [];
}

export function normalizeCompanyName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|limited|group|holdings)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
