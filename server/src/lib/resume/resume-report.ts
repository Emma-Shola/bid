import { prisma } from "@/lib/prisma";

export type ResumeReportRow = {
  id: string;
  createdAt: Date;
  appliedAt: Date;
  jobTitle: string;
  company: string;
  jobUrl: string;
  jobDescription: string;
  score: number | null;
  bidderName: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function getResumeReportRows(managerId: string): Promise<ResumeReportRow[]> {
  const jobs = await prisma.backgroundJob.findMany({
    where: {
      type: "resume.generate",
      // Only include generations the bidder has actually marked as applied —
      // a resume can be generated and never submitted, and those drafts
      // shouldn't pollute the manager's application-tracking export.
      appliedAt: { not: null },
      user: { bidder: { managerId } }
    },
    include: {
      user: {
        select: {
          username: true,
          bidder: { select: { fullName: true } }
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  return jobs.map((job) => {
    const payload = asRecord(job.payload);
    const result = asRecord(job.result);
    const meta = asRecord(result.meta);

    return {
      id: job.id,
      createdAt: job.createdAt,
      appliedAt: job.appliedAt ?? job.createdAt,
      jobTitle: typeof payload.jobTitle === "string" ? payload.jobTitle : "",
      company: typeof payload.company === "string" ? payload.company : "",
      jobUrl: typeof payload.jobUrl === "string" ? payload.jobUrl : "",
      jobDescription: typeof payload.jobDescription === "string" ? payload.jobDescription : "",
      score: typeof meta.score === "number" ? meta.score : null,
      bidderName: job.user.bidder?.fullName || job.user.username
    };
  });
}

const SPANISH_STOPWORDS = [
  "que",
  "para",
  "con",
  "los",
  "las",
  "una",
  "uno",
  "del",
  "por",
  "experiencia",
  "empresa",
  "requisitos",
  "años",
  "trabajo",
  "nuestro",
  "nuestra",
  "buscamos",
  "conocimiento",
  "habilidades",
  "responsabilidades"
];

export function isLikelySpanish(text: string): boolean {
  if (!text.trim()) return false;

  const words = text.toLowerCase().match(/[a-záéíóúñ]+/g) ?? [];
  if (words.length === 0) return false;

  const hits = words.filter((word) => SPANISH_STOPWORDS.includes(word)).length;
  // A handful of common Spanish function words showing up repeatedly is a much
  // stronger signal than any single word — this is a cheap heuristic, not a
  // real language detector, so it's tuned to avoid false positives on English
  // text that merely contains a stray borrowed word.
  return hits >= 4 && hits / words.length > 0.015;
}

const JOB_SITE_HOSTNAMES: Record<string, string> = {
  "linkedin.com": "LinkedIn",
  "indeed.com": "Indeed",
  "greenhouse.io": "Greenhouse",
  "job-boards.greenhouse.io": "Greenhouse",
  "lever.co": "Lever",
  "jobs.lever.co": "Lever",
  "workable.com": "Workable",
  "apply.workable.com": "Workable",
  "weworkremotely.com": "We Work Remotely",
  "remoterocketship.com": "RemoteRocketship",
  "workingnomads.com": "Working Nomads",
  "ashbyhq.com": "Ashby",
  "breezy.hr": "Breezy"
};

export function guessJobSite(jobUrl: string): string {
  if (!jobUrl.trim()) return "";

  try {
    const hostname = new URL(jobUrl).hostname.toLowerCase().replace(/^www\./, "");
    if (JOB_SITE_HOSTNAMES[hostname]) return JOB_SITE_HOSTNAMES[hostname];

    const match = Object.keys(JOB_SITE_HOSTNAMES).find((known) => hostname.endsWith(known));
    return match ? JOB_SITE_HOSTNAMES[match] : "";
  } catch {
    return "";
  }
}
