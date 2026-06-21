import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeWhitespace } from "./shared";
import { DEFAULT_RESUME_MODEL, RESUME_GENERATION_PROMPT_VERSION } from "./config";
import type { JobAnalysis, ParsedResume, TailoredResume } from "./types";
import type { ResumeScore } from "./scoring";
import type { ResumeGapAnalysis } from "./gap-analysis";

type CachedGeneratedResumeRecord = {
  id: string;
  outputText: string;
  structuredJson: Prisma.JsonValue | null;
  atsScore: number | null;
  atsDetails: Prisma.JsonValue | null;
};

type HydratedResumeResult = {
  candidateName: string;
  resumeMarkdown: string;
  coverLetterMarkdown: string;
  validation: {
    ok: boolean;
    issues: string[];
    warnings: string[];
  };
  score: ResumeScore;
  structured: {
    source: ParsedResume;
    jobAnalysis: JobAnalysis;
    gapAnalysis?: ResumeGapAnalysis;
    tailored: TailoredResume;
  };
  cache: {
    hit: boolean;
    fingerprint: string;
    recordId?: string;
    modelName: string;
    promptVersion: string;
  };
};

function normalizeForFingerprint(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return normalizeWhitespace(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForFingerprint(item));
  }

  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = normalizeForFingerprint((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(String(value));
}

export function buildResumeGenerationFingerprint(input: {
  source: ParsedResume;
  jobAnalysis: JobAnalysis;
  modelName?: string;
  promptVersion?: string;
}) {
  const payload = normalizeForFingerprint({
    modelName: normalizeWhitespace(input.modelName || DEFAULT_RESUME_MODEL),
    promptVersion: normalizeWhitespace(input.promptVersion || RESUME_GENERATION_PROMPT_VERSION),
    source: input.source,
    jobAnalysis: input.jobAnalysis
  });

  return crypto.createHash("sha256").update(stableSerialize(payload)).digest("hex");
}

function buildFallbackScore(record: CachedGeneratedResumeRecord): ResumeScore {
  return {
    overall: typeof record.atsScore === "number" ? record.atsScore : 0,
    keywordCoverage: 0,
    skillCoverage: 0,
    quantifiedAchievementScore: 0,
    bulletQualityScore: 0,
    matchedKeywords: [],
    missingKeywords: []
  };
}

function isStructuredJson(value: Prisma.JsonValue | null): value is {
  source: ParsedResume;
  jobAnalysis: JobAnalysis;
  gapAnalysis?: ResumeGapAnalysis;
  tailored: TailoredResume;
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      "source" in value &&
      "jobAnalysis" in value &&
      "tailored" in value
  );
}

export function hydrateCachedGeneratedResumeResult(
  record: CachedGeneratedResumeRecord,
  fingerprint: string,
  modelName: string,
  promptVersion: string
): HydratedResumeResult | null {
  if (!isStructuredJson(record.structuredJson)) {
    return null;
  }

  return {
    candidateName: record.structuredJson.source.name || "Candidate",
    resumeMarkdown: record.outputText,
    coverLetterMarkdown: "",
    validation: {
      ok: true,
      issues: [],
      warnings: []
    },
    score: record.atsDetails && typeof record.atsDetails === "object" ? (record.atsDetails as ResumeScore) : buildFallbackScore(record),
    structured: record.structuredJson,
    cache: {
      hit: true,
      fingerprint,
      recordId: record.id,
      modelName,
      promptVersion
    }
  };
}

export async function loadCachedGeneratedResumeResult(input: {
  fingerprint: string;
  modelName: string;
  promptVersion: string;
}) {
  const record = await prisma.generatedResume.findFirst({
    where: {
      cacheFingerprint: input.fingerprint
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      id: true,
      outputText: true,
      structuredJson: true,
      atsScore: true,
      atsDetails: true
    }
  });

  if (!record) {
    return null;
  }

  return hydrateCachedGeneratedResumeResult(record, input.fingerprint, input.modelName, input.promptVersion);
}
