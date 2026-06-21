import { extractCandidateNameFromResumeText } from "../resume-source";
import { analyzeJobDescription } from "./jd";
import { buildResumeGenerationFingerprint, loadCachedGeneratedResumeResult } from "./cache";
import { normalizeParsedResume } from "./normalizer";
import { parseResumeText } from "./parser";
import { buildResumeExportModel } from "./exporter";
import { buildResumeDebugRunId, createResumeDebugSession } from "./debug";
import { renderResumeMarkdown } from "./renderer";
import { scoreTailoredResume } from "./scoring";
import { buildFallbackTailoredResume, validateTailoredResume } from "./validator";
import { getResumeGenerationModel, parseTailoredResumeOutput, repairTailoredResumeRaw, tailorResumeRawWithRetry } from "./llm";
import { isRecoverableResumeSource, looksLikeResumeInstructionText } from "./content-signals";
import { type TailoredResume } from "./types";
import { RESUME_GENERATION_PROMPT_VERSION } from "./config";
import { buildInitialGapAnalysis, finalizeGapAnalysis } from "./gap-analysis";
import { buildProfileSkeleton } from "./profile-skeleton";

export type GeneratedResumePipelineResult = Awaited<ReturnType<typeof generateDeterministicResumeContent>>;

export async function generateDeterministicResumeContent(input: {
  jobTitle: string;
  company: string;
  jobDescription: string;
  resumeText?: string;
  candidateName?: string;
}) {
  const sourceResumeText = (input.resumeText || "").trim();
  if (!sourceResumeText) {
    throw new Error("Source resume text is required for generation");
  }

  if (looksLikeResumeInstructionText(sourceResumeText) && !isRecoverableResumeSource(sourceResumeText)) {
    throw new Error("Instruction-only TXT files cannot be used as source resumes. Upload the original resume instead.");
  }

  const debugSession = createResumeDebugSession({
    runId: buildResumeDebugRunId({
      sourceText: sourceResumeText,
      jobTitle: input.jobTitle,
      company: input.company,
      jobDescription: input.jobDescription,
      candidateName: input.candidateName || extractCandidateNameFromResumeText(sourceResumeText)
    }),
    label: input.candidateName || extractCandidateNameFromResumeText(sourceResumeText) || "Candidate"
  });

  try {
    const parsed = parseResumeText({
    text: sourceResumeText,
    candidateName: input.candidateName || extractCandidateNameFromResumeText(sourceResumeText)
  });
    debugSession.capture("parsed", parsed);

    const normalized = normalizeParsedResume(parsed, input.candidateName || extractCandidateNameFromResumeText(sourceResumeText));
    debugSession.capture("normalized", normalized);
    const profileSkeleton = buildProfileSkeleton({
      source: normalized,
      targetTitle: input.jobTitle
    });
    debugSession.capture("profile-skeleton", profileSkeleton);

    const jobAnalysis = analyzeJobDescription({
    title: input.jobTitle,
    company: input.company,
    jobDescription: input.jobDescription,
    sourceSkills: []
  });
    debugSession.capture("job-analysis", jobAnalysis);

    const baselineTailored = buildFallbackTailoredResume(profileSkeleton, input.jobTitle, input.company, jobAnalysis);
    const beforeScore = scoreTailoredResume(profileSkeleton, jobAnalysis, baselineTailored);
    const initialGapAnalysis = buildInitialGapAnalysis({
      source: profileSkeleton,
      jobAnalysis,
      beforeScore
    });
    debugSession.capture("gap-analysis-before", initialGapAnalysis);

    const modelName = getResumeGenerationModel();
    const fingerprint = buildResumeGenerationFingerprint({
      source: profileSkeleton,
      jobAnalysis,
      modelName,
      promptVersion: RESUME_GENERATION_PROMPT_VERSION
    });

    const cached = await loadCachedGeneratedResumeResult({
      fingerprint,
      modelName,
      promptVersion: RESUME_GENERATION_PROMPT_VERSION
    }).catch((error) => {
      console.warn("[resume-generation] cache lookup failed; continuing without cache", error);
      return null;
    });

    if (cached) {
      debugSession.capture("final-rendered", cached);
      return cached;
    }

    let tailoredRaw = await tailorResumeRawWithRetry({
      source: profileSkeleton,
      jobAnalysis,
      gapAnalysis: initialGapAnalysis
    }).catch(() => buildFallbackTailoredResume(profileSkeleton, input.jobTitle, input.company, jobAnalysis));

    let tailored: TailoredResume;
    try {
      tailored = typeof tailoredRaw === "string" ? parseTailoredResumeOutput(tailoredRaw) : tailoredRaw;
    } catch {
      tailored = buildFallbackTailoredResume(profileSkeleton, input.jobTitle, input.company, jobAnalysis);
    }
    let validation = validateTailoredResume(profileSkeleton, tailored);

    if (!validation.ok) {
      const repairedRaw = await repairTailoredResumeRaw({
        source: profileSkeleton,
        jobAnalysis,
        gapAnalysis: initialGapAnalysis,
        previousOutput: typeof tailoredRaw === "string" ? tailoredRaw : JSON.stringify(tailoredRaw, null, 2),
        issues: validation.issues
      }).catch(() => null);

      if (repairedRaw) {
        try {
          tailored = parseTailoredResumeOutput(repairedRaw);
          validation = validateTailoredResume(profileSkeleton, tailored);
          if (!validation.ok) {
            tailored = buildFallbackTailoredResume(profileSkeleton, input.jobTitle, input.company, jobAnalysis);
            validation = validateTailoredResume(profileSkeleton, tailored);
          }
        } catch {
          tailored = buildFallbackTailoredResume(profileSkeleton, input.jobTitle, input.company, jobAnalysis);
          validation = validateTailoredResume(profileSkeleton, tailored);
        }
      } else {
        tailored = buildFallbackTailoredResume(profileSkeleton, input.jobTitle, input.company, jobAnalysis);
        validation = validateTailoredResume(profileSkeleton, tailored);
      }
    } else {
      tailored = validation.sanitized;
    }

    const score = scoreTailoredResume(profileSkeleton, jobAnalysis, tailored);
    const gapAnalysis = finalizeGapAnalysis({
      initial: initialGapAnalysis,
      tailored,
      afterScore: score
    });
    const scoreWithTransformationAudit = {
      ...score,
      transformationAudit: gapAnalysis
    };
    debugSession.capture("gap-analysis-after", gapAnalysis);
    debugSession.capture("tailored", tailored);

    const exportModel = buildResumeExportModel({
      source: profileSkeleton,
      tailored
    });
    debugSession.capture("export-model", exportModel);

    const resumeMarkdown = renderResumeMarkdown({
      source: profileSkeleton,
      tailored
    });

    const result = {
      candidateName: profileSkeleton.name || input.candidateName || extractCandidateNameFromResumeText(sourceResumeText) || "Candidate",
      resumeMarkdown,
      coverLetterMarkdown: "",
      validation: {
        ok: validation.ok,
        issues: validation.issues,
        warnings: validation.warnings
      },
      score: scoreWithTransformationAudit,
      structured: {
        source: profileSkeleton,
        jobAnalysis,
        gapAnalysis,
        tailored
      },
      cache: {
        hit: false,
        fingerprint,
        recordId: undefined,
        modelName,
        promptVersion: RESUME_GENERATION_PROMPT_VERSION
      }
    };

    debugSession.capture("final-rendered", result);
    return result;
  } finally {
    await debugSession.finalize();
  }
}
