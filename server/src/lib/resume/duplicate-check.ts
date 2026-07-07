import { prisma } from "@/lib/prisma";
import {
  normalizeCompanyName,
  parseAppliedCompanies,
  parseManagerGenerationRules,
  type AppliedCompanyEntry
} from "@/lib/manager-rules";

export type DuplicateCompanyCheck = {
  blocked: boolean;
  cooldownDays?: number;
  appliedOn?: string;
};

type RecentGenerationJob = { payload: unknown; createdAt: Date };

async function loadRecentGenerationJobs(userId: string, cutoff: Date): Promise<RecentGenerationJob[]> {
  return prisma.backgroundJob.findMany({
    where: {
      userId,
      type: "resume.generate",
      // Only a genuinely completed generation counts as "already applied to
      // this company." A job stuck in qa_required means it never cleared the
      // manager's quality bar even after retries — that's an unresolved draft,
      // not a submitted application, and shouldn't burn the company's 30-day
      // slot when the bidder just wants another attempt at it. Same reasoning
      // excludes failed/dead_letter/queued/processing jobs.
      status: "completed",
      createdAt: { gte: cutoff }
    },
    select: { payload: true, createdAt: true }
  });
}

function findBlockingDate(
  targetCompany: string,
  recentJobs: RecentGenerationJob[],
  appliedCompanies: AppliedCompanyEntry[],
  cutoff: Date
): Date | null {
  const jobDuplicate = recentJobs.find((job) => {
    const payload = job.payload as { company?: unknown } | null;
    const jobCompany = typeof payload?.company === "string" ? normalizeCompanyName(payload.company) : "";
    return jobCompany === targetCompany;
  });

  const importedDuplicate = appliedCompanies.find(
    (entry) => normalizeCompanyName(entry.company) === targetCompany && new Date(entry.appliedAt) >= cutoff
  );

  return jobDuplicate?.createdAt ?? (importedDuplicate ? new Date(importedDuplicate.appliedAt) : null);
}

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
  const recentJobs = await loadRecentGenerationJobs(input.userId, cutoff);
  const appliedCompanies = parseAppliedCompanies(input.appliedCompaniesRaw);
  const blockingDate = findBlockingDate(targetCompany, recentJobs, appliedCompanies, cutoff);

  if (!blockingDate) {
    return { blocked: false, cooldownDays };
  }

  return { blocked: true, cooldownDays, appliedOn: blockingDate.toISOString().slice(0, 10) };
}

/**
 * Same check as checkDuplicateCompany, but for many companies at once —
 * fetches the bidder's recent generation history a single time instead of
 * once per company (matters when a job-board paste contains dozens of
 * listings).
 */
export async function checkDuplicateCompanies(input: {
  userId: string;
  companies: string[];
  managerGenerationRulesRaw: unknown;
  appliedCompaniesRaw: unknown;
}): Promise<Map<string, DuplicateCompanyCheck>> {
  const results = new Map<string, DuplicateCompanyCheck>();
  const managerRules = parseManagerGenerationRules(input.managerGenerationRulesRaw);

  if (!managerRules.duplicateCompanyCooldownDays) {
    for (const company of input.companies) {
      results.set(company, { blocked: false });
    }
    return results;
  }

  const cooldownDays = managerRules.duplicateCompanyCooldownDays;
  const cutoff = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);
  const recentJobs = await loadRecentGenerationJobs(input.userId, cutoff);
  const appliedCompanies = parseAppliedCompanies(input.appliedCompaniesRaw);

  for (const company of input.companies) {
    const targetCompany = normalizeCompanyName(company);
    if (!targetCompany) {
      results.set(company, { blocked: false, cooldownDays });
      continue;
    }

    const blockingDate = findBlockingDate(targetCompany, recentJobs, appliedCompanies, cutoff);
    results.set(
      company,
      blockingDate
        ? { blocked: true, cooldownDays, appliedOn: blockingDate.toISOString().slice(0, 10) }
        : { blocked: false, cooldownDays }
    );
  }

  return results;
}
