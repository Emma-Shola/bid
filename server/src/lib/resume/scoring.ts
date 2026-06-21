import { normalizeKeyword, normalizeWhitespace } from "./shared";
import { type JobAnalysis, type ParsedResume, type TailoredResume } from "./types";

export type ResumeScore = {
  overall: number;
  keywordCoverage: number;
  skillCoverage: number;
  quantifiedAchievementScore: number;
  bulletQualityScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  transformationAudit?: {
    extracted_jd_skills: string[];
    resume_skills: string[];
    proven_skills: string[];
    adjacent_skills: string[];
    missing_skills: string[];
    injected_skills: string[];
    blocked_missing_skills: string[];
    ats_match_before: number;
    ats_match_after: number;
  };
};

const ACTION_VERBS = [
  "built",
  "created",
  "developed",
  "improved",
  "led",
  "delivered",
  "designed",
  "implemented",
  "optimized",
  "managed",
  "reduced",
  "increased",
  "scaled",
  "launched",
  "collaborated",
  "generated",
  "streamlined"
];

function tokenize(text: string) {
  return text
    .split(/[^A-Za-z0-9+.#/-]+/g)
    .map((token) => normalizeKeyword(token))
    .filter((token) => token.length >= 3);
}

function containsKeyword(text: string, keyword: string) {
  if (!keyword.trim()) return false;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function scoreBullet(bullet: string, keywords: string[]) {
  const normalized = normalizeWhitespace(bullet);
  let score = 0;

  if (ACTION_VERBS.some((verb) => new RegExp(`\\b${verb}\\b`, "i").test(normalized))) {
    score += 0.4;
  }

  if (/\b\d+(\.\d+)?%?\b/.test(normalized)) {
    score += 0.3;
  }

  const keywordHits = keywords.filter((keyword) => keyword && new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalized));
  if (keywordHits.length > 0) {
    score += Math.min(0.3, keywordHits.length * 0.1);
  }

  return Math.min(1, score);
}

export function scoreTailoredResume(
  source: ParsedResume,
  jobAnalysis: JobAnalysis,
  tailored: TailoredResume
): ResumeScore {
  const targetSkills = [
    ...jobAnalysis.requiredSkills,
    ...jobAnalysis.preferredSkills,
    ...jobAnalysis.technologies,
    ...jobAnalysis.frameworks,
    ...jobAnalysis.databases,
    ...jobAnalysis.cloudPlatforms,
    ...jobAnalysis.methodologies,
    ...jobAnalysis.tools
  ].map((skill) => normalizeKeyword(skill)).filter(Boolean);
  const analysisKeywords = jobAnalysis.keywords.map((keyword) => normalizeKeyword(keyword)).filter(Boolean);
  const resumeText = normalizeWhitespace(
    [
      tailored.summary,
      tailored.tailoredSkills.join(" "),
      tailored.tailoredExperience.flatMap((item) => item.bullets).join(" ")
    ].join(" ")
  );
  const resumeTokens = new Set(tokenize(resumeText));

  const matchedKeywords = analysisKeywords.filter((keyword) => containsKeyword(resumeText, keyword) || resumeTokens.has(keyword));
  const missingKeywords = analysisKeywords.filter((keyword) => !containsKeyword(resumeText, keyword) && !resumeTokens.has(keyword));

  const keywordCoverage = analysisKeywords.length > 0 ? matchedKeywords.length / analysisKeywords.length : 0;
  const skillCoverage =
    targetSkills.length > 0
      ? targetSkills.filter((skill) => containsKeyword(resumeText, skill) || resumeTokens.has(skill)).length / targetSkills.length
      : 0;

  const allBullets = tailored.tailoredExperience.flatMap((item) => item.bullets);
  const quantifiedAchievementScore =
    allBullets.length > 0 ? allBullets.filter((bullet) => /\b\d+(\.\d+)?%?\b/.test(bullet)).length / allBullets.length : 0;
  const bulletQualityScore =
    allBullets.length > 0
      ? allBullets.reduce((total, bullet) => total + scoreBullet(bullet, analysisKeywords), 0) / allBullets.length
      : 0;

  const overall = Math.round(
    100 *
      (0.35 * keywordCoverage +
        0.25 * skillCoverage +
        0.2 * quantifiedAchievementScore +
        0.2 * bulletQualityScore)
  );

  return {
    overall: Math.max(0, Math.min(100, overall)),
    keywordCoverage,
    skillCoverage,
    quantifiedAchievementScore,
    bulletQualityScore,
    matchedKeywords,
    missingKeywords
  };
}
