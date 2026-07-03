import { z } from "zod";

export const ManagerGenerationRulesSchema = z
  .object({
    minAtsScore: z.number().min(0).max(100).optional(),
    maxGenerationAttempts: z.number().int().min(1).max(5).optional(),
    filenameIncludesCandidateName: z.boolean().optional(),
    groupDownloadsByCompanyFolder: z.boolean().optional()
  })
  .strict();

export type ManagerGenerationRules = z.infer<typeof ManagerGenerationRulesSchema>;

export function parseManagerGenerationRules(raw: unknown): ManagerGenerationRules {
  const parsed = ManagerGenerationRulesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}
