import { normalizeWhitespace } from "./shared";
import { extractStructuredResumeFromText } from "./structured-json";

const INSTRUCTION_PATTERNS = [
  /above is job description and following is current resume/i,
  /resume tailoring instruction/i,
  /instructions for resume generation/i,
  /build one clean json-ready resume instruction file/i,
  /clean the text first/i,
  /remove broken characters/i,
  /preserve all real content/i,
  /headline:\s*create a strong/i,
  /summary:\s*-/i,
  /work experience:\s*-/i,
  /skills:\s*-/i,
  /education:\s*-/i,
  /certificates:\s*-/i,
  /general:\s*-/i,
  /use \[\] if none are found/i,
  /do not invent certifications/i,
  /place the skills section after experience/i,
  /keep the output utf-8 clean/i,
  /downloaded file must use the name/i,
  /never mention jd company name/i,
  /every sentence must be 25\+ words/i
];

const PROMPT_NOISE_PATTERNS = [
  /return strict json only/i,
  /do not add markdown/i,
  /return only strict json/i,
  /source resume json/i,
  /job analysis json/i,
  /professional ats resume tailoring engine/i,
  /candidate resume data/i
];

const RESUME_SIGNAL_PATTERNS = [
  /\b(professional summary|summary|profile|objective|about|overview)\b/i,
  /\b(work experience|professional experience|experience|employment history|work history)\b/i,
  /\b(key skills|skills|technical skills|core competencies|core skills|expertise)\b/i,
  /\b(education|academic background|academics|certifications?|certificates?)\b/i,
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b.*\b(?:19|20)\d{2}\b/i,
  /(?:^|\n)\s*[-*•]\s+\S/m,
  /[\w.+-]+@[\w.-]+\.\w+/i,
  /(?:\+?\d[\d\s().-]{7,}\d)/i
];

const PLACEHOLDER_PATTERNS = [
  /^john doe$/i,
  /^jane doe$/i,
  /^company name$/i,
  /^previous company name$/i,
  /^university name$/i,
  /^school name$/i,
  /^your name$/i,
  /^your email$/i,
  /^your phone number$/i,
  /^your address$/i,
  /^city,\s*state$/i,
  /^month year$/i
];

const CERTIFICATION_PATTERNS = [
  /\bAWS Certified\b/i,
  /\bMicrosoft Certified\b/i,
  /\bGoogle Cloud Certified\b/i,
  /\bGoogle Certified\b/i,
  /\bOracle Certified\b/i,
  /\bCisco Certified\b/i,
  /\bCompTIA\b/i,
  /\bPMP\b/i,
  /\bPMI(?:-ACP)?\b/i,
  /\bCISSP\b/i,
  /\bCISA\b/i,
  /\bCEH\b/i,
  /\bCKA\b/i,
  /\bCKAD\b/i,
  /\bITIL\b/i,
  /\bSAFe\b/i,
  /\bScrum Master\b/i,
  /\bSalesforce Certified\b/i,
  /\bTableau Certified\b/i,
  /\bDatabricks Certified\b/i,
  /\bSnowPro\b/i,
  /\bDocker Certified\b/i,
  /\bKubernetes Certified\b/i,
  /\bTerraform Associate\b/i,
  /\bRHCSA\b/i,
  /\bRed Hat Certified\b/i,
  /\bLinux Foundation Certified\b/i
];

function matchesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function countMatches(value: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(value) ? 1 : 0), 0);
}

function hasStrongResumeSignals(text: string) {
  const score = countMatches(text, RESUME_SIGNAL_PATTERNS);
  return score >= 3 || (score >= 2 && /\b(?:19|20)\d{2}\b/.test(text));
}

export function looksLikeResumeInstructionText(value: string) {
  const text = normalizeWhitespace(value);
  if (!text) return false;
  if (extractStructuredResumeFromText(text)) return false;

  const instructionScore = countMatches(text, INSTRUCTION_PATTERNS) + countMatches(text, PROMPT_NOISE_PATTERNS);
  const resumeScore = countMatches(text, RESUME_SIGNAL_PATTERNS);

  if (hasStrongResumeSignals(text) && instructionScore <= 1) {
    return false;
  }

  return instructionScore >= 2 && instructionScore > resumeScore + 1;
}

export function looksLikePlaceholderResumeText(value: string) {
  const text = normalizeWhitespace(value);
  if (!text) return false;

  return matchesAny(text, PLACEHOLDER_PATTERNS);
}

export function isUsableTailoredText(value: string) {
  const text = normalizeWhitespace(value);
  if (!text) return false;
  if (looksLikeResumeInstructionText(text)) return false;
  if (looksLikePlaceholderResumeText(text)) return false;
  return true;
}

export function isRecoverableResumeSource(value: string) {
  const text = normalizeWhitespace(value);
  if (!text) return false;
  if (extractStructuredResumeFromText(text)) return true;
  return hasStrongResumeSignals(text);
}

function scoreTextRichness(value: string) {
  const text = normalizeWhitespace(value);
  if (!text) return -Infinity;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const hasNumber = /\d/.test(text) ? 2 : 0;
  const hasPercent = /%|\bpercent(?:age)?\b/i.test(text) ? 2 : 0;
  const hasTechnical = /\b(api|apis|rest|graphql|grpc|microservices|aws|gcp|azure|kubernetes|docker|terraform|python|typescript|javascript|react|next|sql|postgres|redis|kafka|observability|performance|scalability)\b/i.test(text) ? 2 : 0;
  const hasSentenceStructure = /[,.;&:]/.test(text) ? 1 : 0;
  return wordCount + hasNumber + hasPercent + hasTechnical + hasSentenceStructure;
}

export function looksLikeRealCertificationEntry(value: string) {
  const text = normalizeWhitespace(value);
  if (!text) return false;

  if (looksLikeResumeInstructionText(text) || looksLikePlaceholderResumeText(text)) {
    return false;
  }

  if (
    /^(summary|professional summary|profile|objective|about|overview|experience|work experience|education|skills|technical skills|core competencies|certifications?|certificates?|licenses?)$/i.test(
      text
    )
  ) {
    return false;
  }

  if (CERTIFICATION_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  const hasCertificationWord = /\b(certified|certification|certificate|licensed|license)\b/i.test(text);
  const hasIssuerShape = /\b(from|issued by|by)\b/i.test(text) || /[|/:\-–—]/.test(text) || /\b[A-Z]{2,}\b/.test(text);
  const hasReasonableLength = text.split(/\s+/).length >= 3;
  const hasInstructionNoise = /\b(keep|preserve|remove|upload|use|generate|tailor|instruction|prompt|json|pdf)\b/i.test(text);

  return hasCertificationWord && hasIssuerShape && hasReasonableLength && !hasInstructionNoise;
}

export function preferTailoredText(source: string, tailored: string) {
  const sourceText = normalizeWhitespace(source);
  const tailoredText = normalizeWhitespace(tailored);

  if (isUsableTailoredText(tailoredText)) {
    return scoreTextRichness(tailoredText) >= scoreTextRichness(sourceText) ? tailoredText : sourceText;
  }

  return sourceText;
}

export function mergePreferredLines(sourceLines: string[], tailoredLines: string[]) {
  const source = sourceLines.map((line) => normalizeWhitespace(line)).filter(Boolean);
  const tailored = tailoredLines.map((line) => normalizeWhitespace(line)).filter(Boolean);

  if (tailored.length === 0) {
    return source;
  }

  const merged: string[] = [];
  const length = Math.max(source.length, tailored.length);

  for (let index = 0; index < length; index += 1) {
    const sourceLine = source[index] ?? "";
    const tailoredLine = tailored[index] ?? "";
    const preferred =
      scoreTextRichness(tailoredLine) >= scoreTextRichness(sourceLine) ? tailoredLine : sourceLine;
    if (preferred) {
      merged.push(preferred);
    }
  }

  return merged.filter(Boolean);
}
