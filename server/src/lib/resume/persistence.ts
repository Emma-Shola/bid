import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/json";
import { type GeneratedResumePipelineResult } from "./pipeline";

type GeneratedResumeResult = GeneratedResumePipelineResult;

export async function createGeneratedResumeRecord(input: {
  resumeId: string;
  bidderId: string;
  jobTitle: string;
  company: string;
  jobDescription: string;
  cacheFingerprint?: string;
  modelName?: string;
  promptVersion?: string;
  result: GeneratedResumeResult;
}) {
  return prisma.generatedResume.create({
    data: {
      resumeId: input.resumeId,
      bidderId: input.bidderId,
      jobTitle: input.jobTitle,
      company: input.company,
      jobDescription: input.jobDescription,
      cacheFingerprint: input.cacheFingerprint,
      modelName: input.modelName,
      promptVersion: input.promptVersion,
      outputText: input.result.resumeMarkdown,
      structuredJson: toPrismaJson(input.result.structured),
      atsScore: input.result.score.overall,
      atsDetails: toPrismaJson(input.result.score)
    },
    select: {
      id: true,
      createdAt: true
    }
  });
}
