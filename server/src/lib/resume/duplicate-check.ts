import { prisma } from "@/lib/prisma";
import { normalizeCompanyName, parseAppliedCompanies, parseManagerGenerationRules } from "@/lib/manager-rules";

export type DuplicateCompanyCheck = {
  blocked: boolean;
  cooldownDays?: number;
  appliedOn?: string;
};

export async function checkDuplicateCompany(input: {
  userId: string;
  company: string;
  managerGenerationRulesRaw: unknown;
  appliedCompaniesRaw: unknown;
}): Promise<DuplicateCompanyCheck> {
  const managerRules = parseManagerGenerationRules(input.managerGenerationRulesRaw);
  if (!managerRules.duplicateCompanyCooldownDays) {
    return { blocked: false };
  }

  const cooldownDays = managerRules.duplicateCompanyCooldownDays;
  const targetCompany = normalizeCompanyName(input.company);
  if (!targetCompany) {
    return { blocked: false, cooldownDays };
  }

  const cutoff = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);

  const recentJobs = await prisma.backgroundJob.findMany({
    where: {
      userId: input.userId,
      type: "resume.generate",
      createdAt: { gte: cutoff }
    },
    select: { payload: true, createdAt: true }
  });

  const jobDuplicate = recentJobs.find((job) => {
    const payload = job.payload as { company?: unknown } | null;
    const jobCompany = typeof payload?.company === "string" ? normalizeCompanyName(payload.company) : "";
    return jobCompany === targetCompany;
  });

  const appliedCompanies = parseAppliedCompanies(input.appliedCompaniesRaw);
  const importedDuplicate = appliedCompanies.find(
    (entry) => normalizeCompanyName(entry.company) === targetCompany && new Date(entry.appliedAt) >= cutoff
  );

  const blockingDate = jobDuplicate?.createdAt ?? (importedDuplicate ? new Date(importedDuplicate.appliedAt) : null);
  if (!blockingDate) {
    return { blocked: false, cooldownDays };
  }

  return { blocked: true, cooldownDays, appliedOn: blockingDate.toISOString().slice(0, 10) };
}
