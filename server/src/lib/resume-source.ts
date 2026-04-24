import path from "node:path";
import { readFile } from "node:fs/promises";
import { extractResumeText } from "@/lib/resume-text";

function inferMimeType(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".doc") return "application/msword";
  if (ext === ".txt") return "text/plain";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function isRemoteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function getFileNameFromUrl(value: string) {
  try {
    return path.basename(new URL(value, "http://localhost").pathname);
  } catch {
    return path.basename(value);
  }
}

async function extractFromBytes(fileName: string, bytes: ArrayBuffer, mimeType?: string | null) {
  const extracted = await extractResumeText({
    fileName,
    mimeType: mimeType ?? inferMimeType(fileName),
    bytes
  });

  return extracted.text.trim();
}

export async function resolveResumeSourceText(input: {
  resumeText?: string | null;
  resumeUrl?: string | null;
}) {
  const inlineText = input.resumeText?.trim();
  if (inlineText) {
    return inlineText;
  }

  const resumeUrl = input.resumeUrl?.trim();
  if (!resumeUrl) {
    return "";
  }

  const fileName = getFileNameFromUrl(resumeUrl);

  try {
    if (isRemoteUrl(resumeUrl)) {
      const response = await fetch(resumeUrl);
      if (!response.ok) {
        return "";
      }

      const bytes = await response.arrayBuffer();
      return await extractFromBytes(fileName, bytes, response.headers.get("content-type"));
    }

    const localPath = path.join(process.cwd(), "public", resumeUrl.replace(/^\//, ""));
    const buffer = await readFile(localPath);
    return await extractFromBytes(fileName, buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), inferMimeType(fileName));
  } catch (error) {
    console.warn("resume source resolution failed", error);
    return "";
  }
}

export function extractCandidateNameFromResumeText(text: string) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const isNoiseLine = (line: string) =>
    /@/.test(line) ||
    /\b(https?:\/\/|www\.)/i.test(line) ||
    /\b(linkedin|github|portfolio|phone|email|address|location)\b/i.test(line) ||
    /\d{3,}/.test(line);

  const candidates = lines.filter((line) => !isNoiseLine(line)).slice(0, 8);

  for (const line of candidates) {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 4 && words.every((word) => /^[A-Za-zÀ-ÿ.'-]+$/.test(word))) {
      return line;
    }
  }

  const result = candidates[0] ?? "";
  return result;
}

export type ResumeSourceOutline = {
  candidateName: string;
  professionalSummary: string;
  keySkills: string[];
  workExperience: string[];
  education: string[];
};

const SECTION_PATTERNS: Array<{ key: keyof Omit<ResumeSourceOutline, "candidateName">; pattern: RegExp }> = [
  { key: "professionalSummary", pattern: /^(professional summary|summary|profile|professional profile|objective)$/i },
  { key: "keySkills", pattern: /^(key skills|skills|technical skills|core competencies|core skills)$/i },
  { key: "workExperience", pattern: /^(work experience|experience|professional experience|employment history|work history)$/i },
  { key: "education", pattern: /^(education|academic background|academics)$/i },
];

function stripMarker(text: string) {
  return text.replace(/^#{1,6}\s+/, "").trim();
}

function normalizeContentLine(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s*[-*•]\s+/, "")
    .replace(/^: /, "")
    .trim();
}

function splitSkills(text: string) {
  return text
    .split(/[•;|]/g)
    .flatMap((part) => part.split(/,\s+/g))
    .map((part) => normalizeContentLine(part))
    .filter(Boolean);
}

function collectSectionItems(lines: string[]) {
  const items: string[] = [];
  let buffer: string[] = [];

  const pushBuffer = () => {
    const text = normalizeContentLine(buffer.join(" ").trim());
    if (text) {
      items.push(text);
    }
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = normalizeContentLine(line);
    if (!trimmed) {
      pushBuffer();
      continue;
    }

    if (/^[-*•]\s+/.test(line.trim()) || /^(responsibilities|achievements|projects)\s*:/i.test(trimmed)) {
      pushBuffer();
      const cleaned = normalizeContentLine(line);
      if (cleaned) {
        items.push(cleaned);
      }
      continue;
    }

    buffer.push(trimmed);
  }

  pushBuffer();
  return items;
}

export function parseResumeSourceOutline(text: string): ResumeSourceOutline {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim());

  const candidateName = extractCandidateNameFromResumeText(text);

  const buckets: Record<keyof Omit<ResumeSourceOutline, "candidateName">, string[]> = {
    professionalSummary: [],
    keySkills: [],
    workExperience: [],
    education: [],
  };

  let currentSection: keyof typeof buckets | null = null;

  const setSection = (line: string) => {
    const heading = stripMarker(line).replace(/[:\s]+$/, "");
    const match = SECTION_PATTERNS.find(({ pattern }) => pattern.test(heading));
    if (match) {
      currentSection = match.key;
      return true;
    }
    return false;
  };

  for (const line of lines) {
    if (!line) {
      continue;
    }

    if (setSection(line)) {
      continue;
    }

    if (!currentSection) {
      continue;
    }

    const targetSection = currentSection as keyof typeof buckets;
    buckets[targetSection].push(line);
  }

  const professionalSummary = collectSectionItems(buckets.professionalSummary).join(" ");
  const keySkills = buckets.keySkills.length > 0 ? splitSkills(buckets.keySkills.join(" ")) : [];
  const workExperience = collectSectionItems(buckets.workExperience);
  const education = collectSectionItems(buckets.education);

  return {
    candidateName,
    professionalSummary,
    keySkills,
    workExperience,
    education,
  };
}

