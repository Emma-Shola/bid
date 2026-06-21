import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { dedupeStrings, normalizeWhitespace } from "./shared";

export type ResumeDebugStage =
  | "parsed"
  | "normalized"
  | "profile-skeleton"
  | "job-analysis"
  | "gap-analysis-before"
  | "tailored"
  | "gap-analysis-after"
  | "export-model"
  | "final-rendered";

export type ResumeDebugMetrics = {
  jsonCharacterCount: number;
  stringCharacterCount: number;
  summaryLength: number;
  skillCategoryCount: number;
  skillCount: number;
  experienceLength: number;
  experienceBulletCount: number;
  educationLength: number;
  educationDetailCount: number;
  certificateCount: number;
  totalBullets: number;
  averageBulletLength: number;
  medianBulletLength: number;
  bulletsWithPercentages: number;
  bulletsWithNumbers: number;
  bulletsWithTechnicalKeywords: number;
};

type ResumeBulletRecord = {
  section: string;
  text: string;
  normalizedText: string;
  wordCount: number;
  characterCount: number;
  containsPercent: boolean;
  containsNumber: boolean;
  containsTechnicalKeyword: boolean;
};

type ResumeDebugBulletDiff = {
  section: string;
  text: string;
  wordCount: number;
  characterCount: number;
};

type ResumeDebugShortenedBulletDiff = {
  section: string;
  before: string;
  after: string;
  beforeWords: number;
  afterWords: number;
  deltaWords: number;
  ratio: number;
};

type ResumeDebugMergedBulletDiff = {
  section: string;
  result: string;
  resultWords: number;
  sourceBullets: string[];
  sourceWords: number;
  combinedSourceWords: number;
};

type ResumeDebugTransitionQuality = {
  removedBullets: ResumeDebugBulletDiff[];
  shortenedBullets: ResumeDebugShortenedBulletDiff[];
  mergedBullets: ResumeDebugMergedBulletDiff[];
  droppedSkills: string[];
  qualityDeclineSignals: string[];
};

export type ResumeDebugSnapshot = {
  stage: ResumeDebugStage;
  at: string;
  metrics: ResumeDebugMetrics;
  payload: unknown;
};

export type ResumeDebugTransition = {
  from: ResumeDebugStage;
  to: ResumeDebugStage;
  losses: Array<{
    metric: keyof ResumeDebugMetrics;
    from: number;
    to: number;
    delta: number;
  }>;
  gains: Array<{
    metric: keyof ResumeDebugMetrics;
    from: number;
    to: number;
    delta: number;
  }>;
  quality: ResumeDebugTransitionQuality;
};

export type ResumeDebugReport = {
  runId: string;
  label?: string;
  rootDir: string;
  markdownFile: string;
  snapshots: Array<{
    stage: ResumeDebugStage;
    file: string;
    metrics: ResumeDebugMetrics;
  }>;
  transitions: ResumeDebugTransition[];
  summary: {
    biggestLoss: ResumeDebugTransition["losses"][number] | null;
    biggestQualityDrop:
      | {
          from: ResumeDebugStage;
          to: ResumeDebugStage;
          metric: keyof ResumeDebugMetrics;
          delta: number;
        }
      | null;
    totalLosses: number;
    totalGains: number;
    totalRemovedBullets: number;
    totalShortenedBullets: number;
    totalMergedBullets: number;
    totalDroppedSkills: number;
  };
};

type ResumeDebugSession = {
  enabled: boolean;
  runId: string;
  rootDir: string;
  label?: string;
  capture: (stage: ResumeDebugStage, payload: unknown) => void;
  finalize: () => Promise<ResumeDebugReport | null>;
};

type StageCollections = {
  summary: string;
  skills: string[];
  skillCategoryCount: number;
  experience: unknown[];
  education: unknown[];
  certificates: unknown[];
  bullets: ResumeBulletRecord[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function countStrings(value: unknown): number {
  if (typeof value === "string") {
    return value.length;
  }

  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countStrings(item), 0);
  }

  if (!isRecord(value)) {
    return 0;
  }

  return (Object.values(value as Record<string, unknown>) as unknown[]).reduce(
    (total: number, item) => total + countStrings(item),
    0
  );
}

function normalizeComparableText(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9+#.%/()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value: string) {
  return normalizeComparableText(value).split(" ").filter(Boolean).length;
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function containsNumber(value: string) {
  return /\d/.test(value);
}

function containsPercent(value: string) {
  return /%|\bpercent(?:age)?\b/i.test(value);
}

const TECH_KEYWORDS = dedupeStrings(
  [
    "api",
    "apis",
    "rest",
    "graphql",
    "grpc",
    "microservices",
    "serverless",
    "aws",
    "amazon web services",
    "gcp",
    "google cloud",
    "azure",
    "kubernetes",
    "docker",
    "terraform",
    "helm",
    "ci cd",
    "devops",
    "python",
    "typescript",
    "javascript",
    "node js",
    "react",
    "next js",
    "vue",
    "angular",
    "django",
    "flask",
    "fastapi",
    "spring",
    "spring boot",
    "java",
    "go",
    "ruby",
    "rails",
    "sql",
    "postgres",
    "postgresql",
    "mysql",
    "mongodb",
    "redis",
    "kafka",
    "rabbitmq",
    "airflow",
    "spark",
    "flink",
    "lambda",
    "dynamodb",
    "s3",
    "sns",
    "sqs",
    "oauth",
    "jwt",
    "saml",
    "prisma",
    "tailwind",
    "redux",
    "html",
    "css",
    "git",
    "github actions",
    "jest",
    "cypress",
    "playwright",
    "prometheus",
    "grafana",
    "elasticsearch",
    "machine learning",
    "pytorch",
    "tensorflow",
    "observability",
    "event driven",
    "performance",
    "scalability"
  ].map((keyword) => normalizeComparableText(keyword))
);

function containsTechnicalKeyword(value: string) {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return false;
  }

  return TECH_KEYWORDS.some((keyword) => {
    if (!keyword) return false;
    if (keyword.length === 1) {
      return normalized.split(" ").includes(keyword);
    }
    return normalized.includes(keyword);
  });
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeWhitespace(String(item))).filter(Boolean);
}

function flattenSkillCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const skills: string[] = [];
  for (const category of value) {
    if (!isRecord(category)) continue;
    skills.push(...toStringList(category.skills));
  }

  return skills;
}

function compactSectionLabel(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => normalizeWhitespace(String(part ?? "")))
    .filter(Boolean)
    .join(" / ");
}

function buildBulletRecord(input: {
  section: string;
  text: string;
}): ResumeBulletRecord | null {
  const text = normalizeWhitespace(input.text);
  if (!text) return null;

  return {
    section: input.section,
    text,
    normalizedText: normalizeComparableText(text),
    wordCount: wordCount(text),
    characterCount: text.length,
    containsPercent: containsPercent(text),
    containsNumber: containsNumber(text),
    containsTechnicalKeyword: containsTechnicalKeyword(text)
  };
}

function readStringField(payload: unknown, field: string): string {
  if (!isRecord(payload)) return "";
  const value = payload[field];
  return typeof value === "string" ? value : "";
}

function readArrayField(payload: unknown, field: string): unknown[] {
  if (!isRecord(payload)) return [];
  const value = payload[field];
  return Array.isArray(value) ? value : [];
}

function collectTailoredBullets(payload: unknown): ResumeBulletRecord[] {
  const bullets: ResumeBulletRecord[] = [];
  if (!isRecord(payload)) return bullets;

  const experience = Array.isArray(payload.tailoredExperience) ? payload.tailoredExperience : [];
  experience.forEach((item, index) => {
    if (!isRecord(item)) return;
    const section = compactSectionLabel([
      "tailored-experience",
      typeof item.company === "string" ? item.company : "",
      typeof item.role === "string" ? item.role : "",
      `#${index + 1}`
    ]);
    toStringList(item.bullets).forEach((bullet, bulletIndex) => {
      const record = buildBulletRecord({
        section: compactSectionLabel([section, `bullet-${bulletIndex + 1}`]),
        text: bullet
      });
      if (record) bullets.push(record);
    });
  });

  return bullets;
}

function collectSourceBullets(source: unknown): ResumeBulletRecord[] {
  const bullets: ResumeBulletRecord[] = [];
  if (!isRecord(source)) return bullets;

  const experience = Array.isArray(source.experience) ? source.experience : [];
  experience.forEach((item, index) => {
    if (!isRecord(item)) return;
    const section = compactSectionLabel([
      "experience",
      typeof item.company === "string" ? item.company : "",
      typeof item.role === "string" ? item.role : "",
      `#${index + 1}`
    ]);
    toStringList(item.bullets).forEach((bullet, bulletIndex) => {
      const record = buildBulletRecord({
        section: compactSectionLabel([section, `bullet-${bulletIndex + 1}`]),
        text: bullet
      });
      if (record) bullets.push(record);
    });
  });

  const education = Array.isArray(source.education) ? source.education : [];
  education.forEach((item, index) => {
    if (!isRecord(item)) return;
    const section = compactSectionLabel([
      "education",
      typeof item.school === "string" ? item.school : "",
      typeof item.degree === "string" ? item.degree : "",
      `#${index + 1}`
    ]);
    toStringList(item.details).forEach((detail, detailIndex) => {
      const record = buildBulletRecord({
        section: compactSectionLabel([section, `detail-${detailIndex + 1}`]),
        text: detail
      });
      if (record) bullets.push(record);
    });
  });

  toStringList(source.certificates).forEach((certificate, index) => {
    const record = buildBulletRecord({
      section: compactSectionLabel(["certificates", `#${index + 1}`]),
      text: certificate
    });
    if (record) bullets.push(record);
  });

  return bullets;
}

function resolveSourceLike(stage: ResumeDebugStage, payload: unknown): {
  source: unknown;
  tailored: unknown;
} {
  if (stage === "final-rendered" && isRecord(payload) && isRecord(payload.structured)) {
    const structured = payload.structured;
    return {
      source: isRecord(structured.source) ? structured.source : payload,
      tailored: isRecord(structured.tailored) ? structured.tailored : payload
    };
  }

  return {
    source: payload,
    tailored: payload
  };
}

function collectSummary(stage: ResumeDebugStage, payload: unknown) {
  if (!isRecord(payload)) return "";

  if (stage === "tailored") {
    return normalizeWhitespace(typeof payload.summary === "string" ? payload.summary : "");
  }

  const { source, tailored } = resolveSourceLike(stage, payload);
  const sourceRecord = isRecord(source) ? source : null;
  const tailoredRecord = isRecord(tailored) ? tailored : null;
  return normalizeWhitespace(
    typeof payload.summary === "string"
      ? payload.summary
      : typeof sourceRecord?.summary === "string"
        ? sourceRecord.summary
        : typeof tailoredRecord?.summary === "string"
          ? tailoredRecord.summary
          : ""
  );
}

function collectSkillList(stage: ResumeDebugStage, payload: unknown) {
  if (!isRecord(payload)) return [];

  if (stage === "tailored") {
    return dedupeStrings(toStringList(payload.tailoredSkills));
  }

  const { source } = resolveSourceLike(stage, payload);
  const sourceRecord = isRecord(source) ? source : null;
  const categories = flattenSkillCategories(sourceRecord?.skillCategories);
  const skills = toStringList(sourceRecord?.skills);
  return dedupeStrings([...categories, ...skills]);
}

function collectStageCollections(stage: ResumeDebugStage, payload: unknown): StageCollections {
  const summary = collectSummary(stage, payload);
  const skills = collectSkillList(stage, payload);
  const { source } = resolveSourceLike(stage, payload);
  const sourceRecord = isRecord(source) ? source : null;
  const skillCategoryCount = stage === "tailored"
    ? 0
    : Array.isArray(sourceRecord?.skillCategories)
      ? sourceRecord.skillCategories.length
      : 0;

  const experience =
    stage === "tailored"
      ? readArrayField(payload, "tailoredExperience")
      : readArrayField(sourceRecord, "experience");
  const education = stage === "tailored" ? [] : readArrayField(sourceRecord, "education");
  const certificates = stage === "tailored" ? [] : readArrayField(sourceRecord, "certificates");
  const bullets = stage === "tailored" ? collectTailoredBullets(payload) : collectSourceBullets(sourceRecord);

  return {
    summary,
    skills,
    skillCategoryCount,
    experience,
    education,
    certificates,
    bullets
  };
}

function countExperienceBullets(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, item) => {
    if (!isRecord(item)) return total;
    const bullets = Array.isArray(item.bullets) ? item.bullets.length : 0;
    return total + bullets;
  }, 0);
}

function countEducationDetails(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, item) => {
    if (!isRecord(item)) return total;
    const details = Array.isArray(item.details) ? item.details.length : 0;
    return total + details;
  }, 0);
}

function buildBulletMetrics(bullets: ResumeBulletRecord[]) {
  const lengths = bullets.map((bullet) => bullet.wordCount);
  return {
    totalBullets: bullets.length,
    averageBulletLength: lengths.length > 0 ? lengths.reduce((sum, value) => sum + value, 0) / lengths.length : 0,
    medianBulletLength: median(lengths),
    bulletsWithPercentages: bullets.filter((bullet) => bullet.containsPercent).length,
    bulletsWithNumbers: bullets.filter((bullet) => bullet.containsNumber).length,
    bulletsWithTechnicalKeywords: bullets.filter((bullet) => bullet.containsTechnicalKeyword).length
  };
}

function buildQualityMetrics(stage: ResumeDebugStage, payload: unknown): ResumeDebugMetrics {
  const collections = collectStageCollections(stage, payload);

  return {
    jsonCharacterCount: JSON.stringify(payload).length,
    stringCharacterCount: countStrings(payload),
    summaryLength: collections.summary.length,
    skillCategoryCount: collections.skillCategoryCount,
    skillCount: collections.skills.length,
    experienceLength: collections.experience.length,
    experienceBulletCount: countExperienceBullets(collections.experience),
    educationLength: collections.education.length,
    educationDetailCount: countEducationDetails(collections.education),
    certificateCount: collections.certificates.length,
    ...buildBulletMetrics(collections.bullets)
  };
}

function tokenSet(value: string) {
  return new Set(normalizeComparableText(value).split(" ").filter(Boolean));
}

function overlapScore(left: string, right: string) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  const minSize = Math.min(leftTokens.size, rightTokens.size);
  const containment = shared / Math.max(minSize, 1);
  const jaccard = shared / Math.max(union, 1);
  return containment * 0.7 + jaccard * 0.3;
}

function compareSkills(previous: string[], current: string[]) {
  const previousList = dedupeStrings(previous.map((skill) => normalizeWhitespace(skill)));
  const currentList = dedupeStrings(current.map((skill) => normalizeWhitespace(skill)));
  const currentMap = new Set(currentList.map((skill) => normalizeComparableText(skill)));
  const droppedSkills = previousList.filter((skill) => !currentMap.has(normalizeComparableText(skill)));
  return { previousList, currentList, droppedSkills };
}

function compareBulletPools(previous: ResumeBulletRecord[], current: ResumeBulletRecord[]) {
  const usedCurrent = new Set<number>();
  const matchedPairs: Array<{ previous: ResumeBulletRecord; current: ResumeBulletRecord; score: number }> = [];

  for (const previousBullet of previous) {
    let bestIndex = -1;
    let bestScore = 0;

    for (let index = 0; index < current.length; index++) {
      if (usedCurrent.has(index)) continue;
      const score = overlapScore(previousBullet.normalizedText, current[index].normalizedText);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex >= 0 && bestScore >= 0.6) {
      usedCurrent.add(bestIndex);
      matchedPairs.push({
        previous: previousBullet,
        current: current[bestIndex],
        score: bestScore
      });
    }
  }

  const removedBullets = previous.filter(
    (previousBullet) =>
      !matchedPairs.some(
        (pair) =>
          pair.previous.normalizedText === previousBullet.normalizedText &&
          pair.previous.section === previousBullet.section
      )
  );

  const shortenedBullets = matchedPairs
    .filter(
      (pair) =>
        pair.current.wordCount < pair.previous.wordCount &&
        pair.current.wordCount <= Math.max(3, Math.floor(pair.previous.wordCount * 0.85))
    )
    .map((pair) => ({
      section: pair.previous.section,
      before: pair.previous.text,
      after: pair.current.text,
      beforeWords: pair.previous.wordCount,
      afterWords: pair.current.wordCount,
      deltaWords: pair.current.wordCount - pair.previous.wordCount,
      ratio: pair.previous.wordCount > 0 ? pair.current.wordCount / pair.previous.wordCount : 1
    }));

  const mergedBullets: ResumeDebugMergedBulletDiff[] = [];
  for (const currentBullet of current) {
    const overlappingPrevious = previous
      .map((previousBullet) => ({
        bullet: previousBullet,
        score: overlapScore(previousBullet.normalizedText, currentBullet.normalizedText)
      }))
      .filter((entry) => entry.score >= 0.35)
      .sort((left, right) => right.score - left.score);

    if (overlappingPrevious.length >= 2) {
      const topSources = overlappingPrevious.slice(0, 3).map((entry) => entry.bullet);
      const combinedSourceWords = topSources.reduce((total, bullet) => total + bullet.wordCount, 0);

      if (combinedSourceWords > currentBullet.wordCount + 4) {
        mergedBullets.push({
          section: currentBullet.section,
          result: currentBullet.text,
          resultWords: currentBullet.wordCount,
          sourceBullets: topSources.map((bullet) => bullet.text),
          sourceWords: topSources.reduce((total, bullet) => total + bullet.wordCount, 0),
          combinedSourceWords
        });
      }
    }
  }

  return {
    removedBullets: removedBullets.map((bullet) => ({
      section: bullet.section,
      text: bullet.text,
      wordCount: bullet.wordCount,
      characterCount: bullet.characterCount
    })),
    shortenedBullets,
    mergedBullets
  };
}

function escapeMarkdown(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#");
}

function renderBulletList(items: ResumeDebugBulletDiff[]) {
  if (items.length === 0) {
    return "- None";
  }

  return items
    .map((item) => `- **${escapeMarkdown(item.section)}**: ${escapeMarkdown(item.text)} (${item.wordCount} words)`)
    .join("\n");
}

function renderShortenedBulletList(items: ResumeDebugShortenedBulletDiff[]) {
  if (items.length === 0) {
    return "- None";
  }

  return items
    .map(
      (item) =>
        `- **${escapeMarkdown(item.section)}**: ${escapeMarkdown(item.before)} -> ${escapeMarkdown(item.after)} (${item.beforeWords} -> ${item.afterWords} words, ${item.ratio.toFixed(2)}x)`
    )
    .join("\n");
}

function renderMergedBulletList(items: ResumeDebugMergedBulletDiff[]) {
  if (items.length === 0) {
    return "- None";
  }

  return items
    .map((item) => {
      const sources = item.sourceBullets.map((bullet) => `"${escapeMarkdown(bullet)}"`).join(" + ");
      return `- **${escapeMarkdown(item.section)}**: ${sources} -> **${escapeMarkdown(item.result)}** (${item.combinedSourceWords} -> ${item.resultWords} words)`;
    })
    .join("\n");
}

function renderSkillList(items: string[]) {
  if (items.length === 0) {
    return "- None";
  }

  return items.map((item) => `- ${escapeMarkdown(item)}`).join("\n");
}

function displayStageName(stage: ResumeDebugStage) {
  switch (stage) {
    case "parsed":
      return "ParsedResume";
    case "normalized":
      return "NormalizedResume";
    case "profile-skeleton":
      return "ProfileSkeleton";
    case "job-analysis":
      return "JobAnalysis";
    case "gap-analysis-before":
      return "GapAnalysisBefore";
    case "tailored":
      return "TailoredResume";
    case "gap-analysis-after":
      return "GapAnalysisAfter";
    case "export-model":
      return "ExportModel";
    case "final-rendered":
      return "FinalRendered";
    default:
      return stage;
  }
}

function metricLabel(metric: keyof ResumeDebugMetrics) {
  const labels: Record<keyof ResumeDebugMetrics, string> = {
    jsonCharacterCount: "JSON characters",
    stringCharacterCount: "String characters",
    summaryLength: "Summary length (chars)",
    skillCategoryCount: "Skill categories",
    skillCount: "Skills count",
    experienceLength: "Experience entries",
    experienceBulletCount: "Experience bullets",
    educationLength: "Education entries",
    educationDetailCount: "Education details",
    certificateCount: "Certificates",
    totalBullets: "Total bullets",
    averageBulletLength: "Average bullet length (words)",
    medianBulletLength: "Median bullet length (words)",
    bulletsWithPercentages: "Bullets with percentages",
    bulletsWithNumbers: "Bullets with numbers",
    bulletsWithTechnicalKeywords: "Bullets with technical keywords"
  };

  return labels[metric] || metric;
}

function formatMetricValue(metric: keyof ResumeDebugMetrics, value: number) {
  if (metric === "averageBulletLength" || metric === "medianBulletLength") {
    return value.toFixed(1);
  }

  return String(Math.round(value));
}

function buildMarkdownReport(report: ResumeDebugReport, snapshots: ResumeDebugSnapshot[]) {
  const snapshotByStage = new Map(snapshots.map((snapshot) => [snapshot.stage, snapshot]));
  const orderedStages: ResumeDebugStage[] = [
    "parsed",
    "normalized",
    "profile-skeleton",
    "job-analysis",
    "gap-analysis-before",
    "tailored",
    "gap-analysis-after",
    "export-model",
    "final-rendered"
  ];
  const lines: string[] = [];

  lines.push("# Resume Quality Report");
  lines.push("");
  lines.push(`- **Run ID:** \`${report.runId}\``);
  if (report.label) {
    lines.push(`- **Label:** ${escapeMarkdown(report.label)}`);
  }
  lines.push(`- **Snapshots:** ${report.snapshots.length}`);
  lines.push(`- **Markdown file:** \`${path.basename(report.markdownFile)}\``);
  lines.push("");
  lines.push("> Bullet lengths are measured in words. Summary length is measured in characters.");
  lines.push("");

  lines.push("## Stage Snapshot Table");
  lines.push("");
  lines.push("| Stage | Total bullets | Avg bullet length | Median bullet length | % bullets | Numeric bullets | Technical bullets | Summary length (chars) | Skills count |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const stage of orderedStages) {
    const snapshot = snapshotByStage.get(stage);
    if (!snapshot) continue;
    const metrics = snapshot.metrics;
    lines.push(
      `| ${displayStageName(stage)} | ${formatMetricValue("totalBullets", metrics.totalBullets)} | ${formatMetricValue("averageBulletLength", metrics.averageBulletLength)} | ${formatMetricValue("medianBulletLength", metrics.medianBulletLength)} | ${formatMetricValue("bulletsWithPercentages", metrics.bulletsWithPercentages)} | ${formatMetricValue("bulletsWithNumbers", metrics.bulletsWithNumbers)} | ${formatMetricValue("bulletsWithTechnicalKeywords", metrics.bulletsWithTechnicalKeywords)} | ${formatMetricValue("summaryLength", metrics.summaryLength)} | ${formatMetricValue("skillCount", metrics.skillCount)} |`
    );
  }
  lines.push("");

  lines.push("## Quality Decrease Hotspots");
  lines.push("");
  if (report.transitions.length === 0) {
    lines.push("- No stage transitions were captured.");
    lines.push("");
  } else {
    for (const transition of report.transitions) {
      lines.push(`### ${displayStageName(transition.from)} -> ${displayStageName(transition.to)}`);
      lines.push("");

      if (transition.quality.qualityDeclineSignals.length === 0) {
        lines.push("- No quality decrease detected on this transition.");
      } else {
        for (const signal of transition.quality.qualityDeclineSignals) {
          lines.push(`- ${escapeMarkdown(signal)}`);
        }
      }
      lines.push("");

      const lossLines = transition.losses.map(
        (loss) =>
          `- **${metricLabel(loss.metric)}**: ${formatMetricValue(loss.metric, loss.from)} -> ${formatMetricValue(loss.metric, loss.to)} (${loss.delta})`
      );
      const gainLines = transition.gains.map(
        (gain) =>
          `- **${metricLabel(gain.metric)}**: ${formatMetricValue(gain.metric, gain.from)} -> ${formatMetricValue(gain.metric, gain.to)} (+${gain.delta})`
      );

      if (lossLines.length > 0) {
        lines.push("**Metric losses**");
        lines.push(...lossLines);
        lines.push("");
      }

      if (gainLines.length > 0) {
        lines.push("**Metric gains**");
        lines.push(...gainLines);
        lines.push("");
      }

      lines.push("**Removed bullets**");
      lines.push(renderBulletList(transition.quality.removedBullets));
      lines.push("");

      lines.push("**Shortened bullets**");
      lines.push(renderShortenedBulletList(transition.quality.shortenedBullets));
      lines.push("");

      lines.push("**Merged bullets**");
      lines.push(renderMergedBulletList(transition.quality.mergedBullets));
      lines.push("");

      lines.push("**Dropped skills**");
      lines.push(renderSkillList(transition.quality.droppedSkills));
      lines.push("");
    }
  }

  lines.push("## Where Quality Decreases Most");
  lines.push("");
  if (report.summary.biggestQualityDrop) {
    const hotspot = report.summary.biggestQualityDrop;
    lines.push(
      `- **${displayStageName(hotspot.from)} -> ${displayStageName(hotspot.to)}** on **${metricLabel(hotspot.metric)}** (${hotspot.delta})`
    );
  } else {
    lines.push("- No measurable quality drop was found.");
  }
  lines.push("");

  lines.push("## Aggregate Loss Summary");
  lines.push("");
  lines.push(`- **Total metric losses:** ${report.summary.totalLosses}`);
  lines.push(`- **Total metric gains:** ${report.summary.totalGains}`);
  lines.push(`- **Removed bullets:** ${report.summary.totalRemovedBullets}`);
  lines.push(`- **Shortened bullets:** ${report.summary.totalShortenedBullets}`);
  lines.push(`- **Merged bullets:** ${report.summary.totalMergedBullets}`);
  lines.push(`- **Dropped skills:** ${report.summary.totalDroppedSkills}`);
  lines.push("");

  return `${lines.join("\n")}\n`;
}

export function buildResumeDebugRunId(input: {
  sourceText: string;
  jobTitle: string;
  company: string;
  jobDescription: string;
  candidateName?: string;
}) {
  const hash = createHash("sha256");
  hash.update(input.sourceText || "");
  hash.update("\n---JOB---\n");
  hash.update(input.jobTitle || "");
  hash.update("\n");
  hash.update(input.company || "");
  hash.update("\n");
  hash.update(input.jobDescription || "");
  hash.update("\n");
  hash.update(input.candidateName || "");
  return hash.digest("hex").slice(0, 16);
}

export function createResumeDebugSession(input: {
  runId: string;
  label?: string;
}): ResumeDebugSession {
  const enabled = /^(1|true)$/i.test((process.env.RESUME_DEBUG_DUMP || "").trim());
  const rootDir = path.resolve(process.cwd(), process.env.RESUME_DEBUG_DIR || ".resume-debug");
  const runDir = path.join(rootDir, input.runId);
  const snapshots: ResumeDebugSnapshot[] = [];
  const writes: Promise<void>[] = [];

  const writeSnapshot = async (snapshot: ResumeDebugSnapshot) => {
    const index = snapshots.findIndex((item) => item.stage === snapshot.stage);
    const fileName = `${String(index + 1).padStart(2, "0")}-${snapshot.stage}.json`;
    const filePath = path.join(runDir, fileName);
    await writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf8");
    return { filePath, fileName };
  };

  const ensureRoot = async () => {
    if (!enabled) return;
    await mkdir(runDir, { recursive: true });
  };

  return {
    enabled,
    runId: input.runId,
    rootDir,
    label: input.label,
    capture(stage, payload) {
      if (!enabled) return;
      const snapshot: ResumeDebugSnapshot = {
        stage,
        at: new Date().toISOString(),
        metrics: buildQualityMetrics(stage, payload),
        payload
      };

      snapshots.push(snapshot);
      writes.push(
        ensureRoot()
          .then(() => writeSnapshot(snapshot))
          .then(() => undefined)
          .catch((error) => {
            console.warn(`[resume-debug] failed to write ${stage} snapshot`, error);
          })
      );
    },
    async finalize() {
      if (!enabled) return null;

      await Promise.allSettled(writes);
      if (snapshots.length === 0) {
        return null;
      }

      const stageCollections = new Map(
        snapshots.map((snapshot) => [snapshot.stage, collectStageCollections(snapshot.stage, snapshot.payload)])
      );

      const watchedMetrics: Array<keyof ResumeDebugMetrics> = [
        "jsonCharacterCount",
        "stringCharacterCount",
        "summaryLength",
        "skillCategoryCount",
        "skillCount",
        "experienceLength",
        "experienceBulletCount",
        "educationLength",
        "educationDetailCount",
        "certificateCount",
        "totalBullets",
        "averageBulletLength",
        "medianBulletLength",
        "bulletsWithPercentages",
        "bulletsWithNumbers",
        "bulletsWithTechnicalKeywords"
      ];

      const transitions: ResumeDebugTransition[] = [];
      let biggestLoss: ResumeDebugTransition["losses"][number] | null = null;
      let biggestQualityDrop:
        | {
            from: ResumeDebugStage;
            to: ResumeDebugStage;
            metric: keyof ResumeDebugMetrics;
            delta: number;
          }
        | null = null;
      let totalRemovedBullets = 0;
      let totalShortenedBullets = 0;
      let totalMergedBullets = 0;
      let totalDroppedSkills = 0;

      for (let i = 1; i < snapshots.length; i++) {
        const previous = snapshots[i - 1];
        const current = snapshots[i];
        const losses: ResumeDebugTransition["losses"] = [];
        const gains: ResumeDebugTransition["gains"] = [];

        for (const metric of watchedMetrics) {
          const from = previous.metrics[metric];
          const to = current.metrics[metric];
          const delta = to - from;
          if (delta < 0) {
            const loss = { metric, from, to, delta };
            losses.push(loss);
            if (!biggestLoss || loss.delta < biggestLoss.delta) {
              biggestLoss = loss;
            }
            if (!biggestQualityDrop || loss.delta < biggestQualityDrop.delta) {
              biggestQualityDrop = {
                from: previous.stage,
                to: current.stage,
                metric,
                delta
              };
            }
          } else if (delta > 0) {
            gains.push({ metric, from, to, delta });
          }
        }

        const previousContent = stageCollections.get(previous.stage);
        const currentContent = stageCollections.get(current.stage);
        const bulletComparison = previousContent && currentContent
          ? compareBulletPools(previousContent.bullets, currentContent.bullets)
          : { removedBullets: [], shortenedBullets: [], mergedBullets: [] };
        const skillComparison = previousContent && currentContent
          ? compareSkills(previousContent.skills, currentContent.skills)
          : { droppedSkills: [] };

        totalRemovedBullets += bulletComparison.removedBullets.length;
        totalShortenedBullets += bulletComparison.shortenedBullets.length;
        totalMergedBullets += bulletComparison.mergedBullets.length;
        totalDroppedSkills += skillComparison.droppedSkills.length;

        const qualityDeclineSignals: string[] = [];
        if (current.metrics.totalBullets < previous.metrics.totalBullets) {
          qualityDeclineSignals.push(
            `Total bullets dropped from ${previous.metrics.totalBullets} to ${current.metrics.totalBullets} (${current.metrics.totalBullets - previous.metrics.totalBullets}).`
          );
        }
        if (current.metrics.averageBulletLength < previous.metrics.averageBulletLength) {
          qualityDeclineSignals.push(
            `Average bullet length dropped from ${previous.metrics.averageBulletLength.toFixed(1)} to ${current.metrics.averageBulletLength.toFixed(1)} words.`
          );
        }
        if (current.metrics.medianBulletLength < previous.metrics.medianBulletLength) {
          qualityDeclineSignals.push(
            `Median bullet length dropped from ${previous.metrics.medianBulletLength.toFixed(1)} to ${current.metrics.medianBulletLength.toFixed(1)} words.`
          );
        }
        if (current.metrics.bulletsWithTechnicalKeywords < previous.metrics.bulletsWithTechnicalKeywords) {
          qualityDeclineSignals.push(
            `Technical keyword bullets dropped from ${previous.metrics.bulletsWithTechnicalKeywords} to ${current.metrics.bulletsWithTechnicalKeywords}.`
          );
        }
        if (current.metrics.bulletsWithNumbers < previous.metrics.bulletsWithNumbers) {
          qualityDeclineSignals.push(
            `Numeric bullets dropped from ${previous.metrics.bulletsWithNumbers} to ${current.metrics.bulletsWithNumbers}.`
          );
        }
        if (current.metrics.bulletsWithPercentages < previous.metrics.bulletsWithPercentages) {
          qualityDeclineSignals.push(
            `Percentage bullets dropped from ${previous.metrics.bulletsWithPercentages} to ${current.metrics.bulletsWithPercentages}.`
          );
        }
        if (skillComparison.droppedSkills.length > 0) {
          qualityDeclineSignals.push(`Dropped ${skillComparison.droppedSkills.length} skill(s) between stages.`);
        }
        if (bulletComparison.removedBullets.length > 0) {
          qualityDeclineSignals.push(`Removed ${bulletComparison.removedBullets.length} bullet(s) between stages.`);
        }
        if (bulletComparison.shortenedBullets.length > 0) {
          qualityDeclineSignals.push(`Shortened ${bulletComparison.shortenedBullets.length} bullet(s) between stages.`);
        }
        if (bulletComparison.mergedBullets.length > 0) {
          qualityDeclineSignals.push(`Merged ${bulletComparison.mergedBullets.length} bullet(s) between stages.`);
        }

        transitions.push({
          from: previous.stage,
          to: current.stage,
          losses,
          gains,
          quality: {
            removedBullets: bulletComparison.removedBullets,
            shortenedBullets: bulletComparison.shortenedBullets,
            mergedBullets: bulletComparison.mergedBullets,
            droppedSkills: skillComparison.droppedSkills,
            qualityDeclineSignals
          }
        });
      }

      const report: ResumeDebugReport = {
        runId: input.runId,
        label: input.label,
        rootDir: runDir,
        markdownFile: path.join(runDir, "report.md"),
        snapshots: snapshots.map((snapshot, index) => ({
          stage: snapshot.stage,
          file: `${String(index + 1).padStart(2, "0")}-${snapshot.stage}.json`,
          metrics: snapshot.metrics
        })),
        transitions,
        summary: {
          biggestLoss,
          biggestQualityDrop,
          totalLosses: transitions.reduce((sum, transition) => sum + transition.losses.length, 0),
          totalGains: transitions.reduce((sum, transition) => sum + transition.gains.length, 0),
          totalRemovedBullets,
          totalShortenedBullets,
          totalMergedBullets,
          totalDroppedSkills
        }
      };

      const markdown = buildMarkdownReport(report, snapshots);
      await mkdir(runDir, { recursive: true });
      await writeFile(path.join(runDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
      await writeFile(report.markdownFile, markdown, "utf8");
      return report;
    }
  };
}
