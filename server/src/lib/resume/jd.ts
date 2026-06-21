import { dedupeStrings, normalizeKeyword, normalizeWhitespace } from "./shared";
import { JobAnalysisSchema, type JobAnalysis, type ParsedResume } from "./types";
import { normalizeJobAnalysis } from "./normalizer";
import { extractKnownSkillCategories, flattenSkillCategories } from "./skill-taxonomy";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "your",
  "our",
  "you",
  "are",
  "will",
  "have",
  "has",
  "their",
  "they",
  "them",
  "role",
  "team",
  "work",
  "works",
  "experience",
  "required",
  "requirements",
  "preferred",
  "responsibilities"
]);

const DOMAIN_RULES: Array<{ domain: string; keywords: RegExp[] }> = [
  { domain: "cloud", keywords: [/\baws\b/i, /\bgcp\b/i, /\bazure\b/i, /\bkubernetes\b/i, /\bdocker\b/i] },
  { domain: "data", keywords: [/\bsql\b/i, /\betl\b/i, /\bwarehouse\b/i, /\banalytics\b/i, /\bpipeline\b/i] },
  { domain: "frontend", keywords: [/\breact\b/i, /\bvue\b/i, /\bangular\b/i, /\bui\b/i, /\bfrontend\b/i] },
  { domain: "backend", keywords: [/\bapi\b/i, /\bmicroservices\b/i, /\bnode\.?js\b/i, /\bjava\b/i, /\bgo\b/i] },
  { domain: "product", keywords: [/\bproduct\b/i, /\bstrategy\b/i, /\broadmap\b/i, /\bcustomer\b/i] },
  { domain: "finance", keywords: [/\bbank\b/i, /\bfintech\b/i, /\bpayments?\b/i, /\brisk\b/i, /\bcompliance\b/i] },
  { domain: "healthcare", keywords: [/\bhealth\b/i, /\bclinical\b/i, /\bpatient\b/i, /\bmedical\b/i] },
  { domain: "sales", keywords: [/\bsales?\b/i, /\baccount\b/i, /\bcrm\b/i, /\bgrowth\b/i] }
];

function extractPhrases(text: string) {
  const matches =
    text.match(
      /\b[A-Za-z][A-Za-z0-9+./#-]*(?:\s+[A-Za-z][A-Za-z0-9+./#-]*){0,2}\b/g
    ) ?? [];

  return matches
    .map((phrase) => normalizeWhitespace(phrase))
    .filter((phrase) => phrase.length >= 3 && phrase.length <= 42)
    .filter((phrase) => !STOP_WORDS.has(normalizeKeyword(phrase)))
    .filter((phrase) => /[A-Za-z]/.test(phrase));
}

function extractKeywordsFromText(text: string) {
  const phrases = extractPhrases(text);
  const tokens = text
    .split(/[^A-Za-z0-9+.#/-]+/g)
    .map((token) => normalizeWhitespace(token))
    .filter((token) => token.length >= 3 && token.length <= 24)
    .filter((token) => /[A-Za-z]/.test(token))
    .filter((token) => !STOP_WORDS.has(normalizeKeyword(token)));

  return dedupeStrings([...phrases, ...tokens]);
}

function extractMustHaveSentences(text: string) {
  return text
    .split(/\n+/g)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/g))
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean)
    .filter((sentence) => /(required|must have|must\s+be|need to|should have|experience with|proficient in|looking for)/i.test(sentence));
}

function splitJobSentences(text: string) {
  return text
    .split(/\n+/g)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/g))
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean);
}

function extractResponsibilities(text: string) {
  return splitJobSentences(text)
    .filter((sentence) =>
      /\b(design|build|develop|lead|own|manage|architect|optimi[sz]e|scale|maintain|implement|deliver|monitor|support|collaborate|partner|automate|migrate|improve|create)\b/i.test(
        sentence
      )
    )
    .slice(0, 12);
}

function inferDomain(text: string) {
  for (const rule of DOMAIN_RULES) {
    if (rule.keywords.some((regex) => regex.test(text))) {
      return rule.domain;
    }
  }

  return "professional-services";
}

function inferSeniority(text: string): JobAnalysis["seniority"] {
  if (/\b(principal|staff|lead|head)\b/i.test(text)) return "staff";
  if (/\b(senior|sr\.?)\b/i.test(text)) return "senior";
  if (/\b(junior|associate|entry[-\s]?level)\b/i.test(text)) return "junior";
  return "mid";
}

export function analyzeJobDescription(input: {
  title: string;
  company: string;
  jobDescription: string;
  sourceSkills: string[];
}): JobAnalysis {
  const raw = normalizeWhitespace([input.title, input.company, input.jobDescription].filter(Boolean).join("\n"));
  const sourceSkills = dedupeStrings(input.sourceSkills.map((skill) => normalizeWhitespace(skill)));
  const jobKeywords = extractKeywordsFromText(raw);
  const mustHaveSkills = extractMustHaveSentences(input.jobDescription);

  const niceToHaveSkills = splitJobSentences(input.jobDescription)
    .filter((sentence) => /(preferred|nice to have|bonus|plus|would be a plus|ideal candidate)/i.test(sentence));
  const knownSkillCategories = extractKnownSkillCategories(raw);
  const knownSkills = flattenSkillCategories(knownSkillCategories);
  const requiredSkills = dedupeStrings(flattenSkillCategories(extractKnownSkillCategories(mustHaveSkills.join("\n"))));
  const preferredSkills = dedupeStrings(flattenSkillCategories(extractKnownSkillCategories(niceToHaveSkills.join("\n"))));
  const responsibilities = extractResponsibilities(input.jobDescription);
  const domainKeywords = jobKeywords
    .filter((keyword) => keyword.split(/\s+/).length <= 3)
    .filter((keyword) => !knownSkills.some((skill) => normalizeKeyword(skill) === normalizeKeyword(keyword)))
    .slice(0, 30);

  const keywords = dedupeStrings([
    ...sourceSkills,
    ...knownSkills,
    ...jobKeywords,
    ...requiredSkills,
    ...preferredSkills,
    ...mustHaveSkills,
    ...niceToHaveSkills,
    ...responsibilities,
    ...domainKeywords
  ]);

  return JobAnalysisSchema.parse(
    normalizeJobAnalysis({
      title: input.title,
      company: input.company,
      domain: inferDomain(raw),
      seniority: inferSeniority(raw),
      keywords,
      mustHaveSkills,
      niceToHaveSkills,
      requiredSkills,
      preferredSkills,
      technologies: knownSkills,
      frameworks: knownSkillCategories.frameworks,
      databases: knownSkillCategories.databases,
      cloudPlatforms: knownSkillCategories.cloudPlatforms,
      methodologies: knownSkillCategories.methodologies,
      tools: knownSkillCategories.tools,
      responsibilities,
      domainKeywords
    })
  );
}
