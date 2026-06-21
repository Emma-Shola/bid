import { extractCandidateNameFromResumeText } from "../resume-source";
import {
  ParsedResumeSchema,
  type ParsedResume,
  type ResumeContact,
  type ResumeEducation,
  type ResumeExperience,
  type ResumeSkillCategory
} from "./types";
import {
  compactJoin,
  isBulletLine,
  isLikelyDateText,
  isSectionHeading,
  normalizeWhitespace,
  splitBlocks,
  stripBulletMarker
} from "./shared";
import { extractStructuredResumeFromText } from "./structured-json";
import { looksLikeRealCertificationEntry, looksLikeResumeInstructionText } from "./content-signals";
import { unwrapResumeContainerText } from "./wrapped-content";

const SECTION_PATTERNS = [
  { key: "summary", pattern: /^(professional summary|summary|profile|objective|about|overview)$/i },
  { key: "skills", pattern: /^(key skills|skills|technical skills|core competencies|core skills|expertise)$/i },
  {
    key: "experience",
    pattern: /^(work experience|professional experience|experience|employment history|work history)$/i
  },
  { key: "education", pattern: /^(education|academic background|academics)$/i },
  { key: "certificates", pattern: /^(certifications|certificates|licenses|licenses & certifications)$/i }
] as const;

type SectionKey = "summary" | "skills" | "experience" | "education" | "certificates";

const PROMPT_TEMPLATE_MARKERS = [
  /give me my resume in json format/i,
  /give me result like below/i,
  /below is base json format/i,
  /before returning code panels/i,
  /insert code panel including meta data/i,
  /if you understand all of these exactly/i,
  /give me another code panel with cover letter in json/i,
  /build one clean json-ready resume instruction file/i,
  /clean the text first/i,
  /remove broken characters/i,
  /preserve all real content from the source resume/i,
  /downloaded file must use the name/i,
  /do not invent certifications/i,
  /use \[\] if none are found/i
];

function isPaginationLine(line: string) {
  const text = normalizeWhitespace(line);
  return /^--\s*\d+\s+of\s+\d+\s*--$/i.test(text) || /^page\s+\d+(\s+of\s+\d+)?$/i.test(text);
}

function detectSection(line: string): SectionKey | null {
  const trimmed = line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/[:\-–—\s]+$/, "")
    .trim();
  const match = SECTION_PATTERNS.find(({ pattern }) => pattern.test(trimmed));
  return (match?.key as SectionKey | undefined) ?? null;
}

function looksLikePromptTemplateText(text: string) {
  return PROMPT_TEMPLATE_MARKERS.some((pattern) => pattern.test(text));
}

function extractHeaderMetadata(lines: string[]) {
  const metadata: Partial<ParsedResume["contact"]> & { name?: string; title?: string } = {};

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (!line) continue;

    const namedMatches = [
      { key: "name" as const, pattern: /^name\s*:\s*(.+)$/i },
      { key: "title" as const, pattern: /^(?:role|title|position)\s*:\s*(.+)$/i },
      { key: "email" as const, pattern: /^email(?: address)?\s*:\s*(.+)$/i },
      { key: "phone" as const, pattern: /^phone(?: number)?\s*:\s*(.+)$/i },
      { key: "location" as const, pattern: /^location\s*:\s*(.+)$/i },
      { key: "linkedin" as const, pattern: /^linkedin\s*:\s*(.+)$/i },
      { key: "github" as const, pattern: /^github\s*:\s*(.+)$/i },
      { key: "website" as const, pattern: /^website\s*:\s*(.+)$/i }
    ];

    for (const entry of namedMatches) {
      if (metadata[entry.key]) continue;
      const match = line.match(entry.pattern);
      if (match?.[1]) {
        metadata[entry.key] = normalizeWhitespace(match[1]);
      }
    }
  }

  return metadata;
}

function extractContact(lines: string[]): ResumeContact {
  const contact: ResumeContact = {
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    website: ""
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const segments = trimmed
      .split(/\s*[|•]\s*/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (!contact.email) {
      const emailMatch = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (emailMatch) contact.email = emailMatch[0];
    }

    if (!contact.phone) {
      const phoneMatch = trimmed.match(/(?:\+?\d{1,3}[\s-]*)?(?:\(?\d{3}\)?[\s-]*)\d{3}[\s-]*\d{4}/);
      if (phoneMatch) contact.phone = phoneMatch[0].trim();
    }

    if (!contact.linkedin && /linkedin\.com/i.test(trimmed)) {
      contact.linkedin = trimmed;
    }

    if (!contact.github && /github\.com/i.test(trimmed)) {
      contact.github = trimmed;
    }

    if (!contact.website && /^https?:\/\//i.test(trimmed) && !/linkedin\.com|github\.com/i.test(trimmed)) {
      contact.website = trimmed;
    }

    if (!contact.location) {
      for (const segment of segments) {
        if (/^([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+)*,\s*[A-Z]{2}(?:\s+\d{5})?)$/.test(segment)) {
          contact.location = segment;
          break;
        }
      }
    }
  }

  return contact;
}

function looksLikeLocationText(value: string) {
  return /^([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+)*,\s*[A-Z]{2}(?:\s+\d{5})?)$/.test(
    normalizeWhitespace(value)
  );
}

function extractNameAndTitle(headerLines: string[], fallbackName: string) {
  const meaningful = headerLines.filter((line) => {
    const trimmed = line.trim();
    return (
      trimmed &&
      !/[@]|https?:\/\//i.test(trimmed) &&
      !/\b(email|phone|linkedin|github|portfolio|address|location)\b/i.test(trimmed)
    );
  });

  const name = fallbackName || meaningful[0] || "";
  const nameIndex = meaningful.findIndex((line) => line === name);
  const title = meaningful.slice(Math.max(nameIndex + 1, 0)).find((line) => !isLikelyDateText(line)) || "";

  return { name, title };
}

function splitCompanyLocation(line: string) {
  const normalized = line.replace(/\u00a0/g, " ").trim();
  const separators = ["\t", " · ", " | ", " — "];

  for (const separator of separators) {
    if (!normalized.includes(separator)) {
      continue;
    }

    const [left, ...rest] = normalized.split(separator);
    const right = rest.join(separator).trim();
    if (left.trim() && right) {
      return {
        company: left.trim(),
        location: right
      };
    }
  }

  const companyLocationMatch = normalized.match(/^(.+?)\s+(?:-|–|—)\s+(.+)$/);
  if (companyLocationMatch) {
    const company = normalizeWhitespace(companyLocationMatch[1] ?? "");
    const location = normalizeWhitespace(companyLocationMatch[2] ?? "");
    if (company && looksLikeLocationText(location)) {
      return { company, location };
    }
  }

  const doubleSpaceParts = normalized
    .split(/\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (doubleSpaceParts.length >= 2) {
    return {
      company: doubleSpaceParts[0],
      location: doubleSpaceParts.slice(1).join(" ")
    };
  }

  return {
    company: normalized,
    location: ""
  };
}

function splitRoleAndDuration(line: string) {
  const normalized = normalizeWhitespace(line);
  const durationMatch = normalized.match(
    /((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|\b(?:19|20)\d{2}\b)[\s\S]*)$/i
  );

  if (durationMatch && durationMatch.index != null) {
    const role = normalizeWhitespace(normalized.slice(0, durationMatch.index).replace(/[-|,]\s*$/, ""));
    const duration = normalizeWhitespace(durationMatch[1]);
    if (role && duration) {
      return { role, duration };
    }
  }

  return {
    role: normalized,
    duration: ""
  };
}

function splitDegreeAndDuration(line: string) {
  const normalized = normalizeWhitespace(line);
  const durationMatch = normalized.match(
    /((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|\b(?:19|20)\d{2}\b)[\s\S]*)$/i
  );

  if (durationMatch && durationMatch.index != null) {
    const degree = normalizeWhitespace(normalized.slice(0, durationMatch.index).replace(/[-|,]\s*$/, ""));
    const duration = normalizeWhitespace(durationMatch[1]);
    if (degree && duration) {
      return { degree, duration };
    }
  }

  return {
    degree: normalized,
    duration: ""
  };
}

function looksLikeExperienceHeaderLine(line: string) {
  const text = normalizeWhitespace(line);
  const monthPattern =
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i;
  return monthPattern.test(text) && /(?:\b(?:19|20)\d{2}\b|\bPresent\b|\bCurrent\b|\bToday\b)/i.test(text);
}

function looksLikeStandaloneExperienceTitleLine(line: string) {
  const text = normalizeWhitespace(line);
  if (!text || isPaginationLine(text) || isBulletLine(text) || isLikelyDateText(text)) {
    return false;
  }

  if (/@|https?:\/\//i.test(text) || looksLikeEducationStartLine(text)) {
    return false;
  }

  if (text.length > 90 || /[.!?]$/.test(text)) {
    return false;
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 10) {
    return false;
  }

  return /(?:intern|engineer|developer|mentor|lead|manager|associate|specialist|analyst|coordinator|architect|designer|consultant|volunteer|advisor|fellow|software|full stack|frontend|backend)/i.test(
    text
  );
}

function looksLikeEducationStartLine(line: string) {
  const text = normalizeWhitespace(line);
  const monthPattern =
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i;
  const yearRangePattern = /\b(?:19|20)\d{2}\b\s*[–-]\s*\b(?:19|20)\d{2}\b/;

  return (
    /(bachelor|master|associate|phd|doctor|degree|diploma|certificate|computer science|engineering|science|arts|business)/i.test(
      text
    ) &&
    (monthPattern.test(text) || yearRangePattern.test(text) || /\b(?:19|20)\d{2}\b/.test(text))
  );
}

function groupParagraphLines(lines: string[]) {
  const paragraphs: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const text = normalizeWhitespace(buffer.join(" "));
    if (text) {
      paragraphs.push(text);
    }
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (!line || isPaginationLine(line)) {
      flush();
      continue;
    }

    if (isBulletLine(line)) {
      flush();
      const bullet = normalizeWhitespace(stripBulletMarker(line));
      if (bullet) {
        paragraphs.push(bullet);
      }
      continue;
    }

    buffer.push(line);
    if (/[.!?]$/.test(line)) {
      flush();
    }
  }

  flush();
  return paragraphs.filter(Boolean);
}

function collectLiteralLines(lines: string[]) {
  return lines
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line && !isPaginationLine(line) && !isSectionHeading(line));
}

function collectLiteralBullets(lines: string[]) {
  const cleaned = collectLiteralLines(lines);
  if (cleaned.length === 0) {
    return [];
  }

  return cleaned.map((line) => {
    if (isBulletLine(line)) {
      return normalizeWhitespace(stripBulletMarker(line));
    }

    return line;
  });
}

function parseSkillCategories(lines: string[]): ResumeSkillCategory[] {
  const categories: ResumeSkillCategory[] = [];
  let currentCategory = "";
  let currentValue = "";

  const flush = () => {
    const normalizedValue = normalizeWhitespace(currentValue).replace(/-\s+/g, "-");
    if (!currentCategory && !normalizedValue) {
      currentValue = "";
      return;
    }

    const skills = normalizedValue
      .split(/[,;|]/g)
      .map((skill) => normalizeWhitespace(skill))
      .filter(Boolean)
      .map((skill) => skill.replace(/\s*-\s*/g, "-"))
      .map((skill) => skill.replace(/&amp;/g, "&"));

    if (currentCategory || skills.length > 0) {
      categories.push({
        category: currentCategory.replace(/&amp;/g, "&"),
        skills
      });
    }

    currentCategory = "";
    currentValue = "";
  };

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine).replace(/&amp;/g, "&");
    if (!line || isPaginationLine(line)) {
      continue;
    }

    const colonIndex = line.indexOf(":");
    const prefix = colonIndex > 0 ? line.slice(0, colonIndex).trim() : "";
    const suffix = colonIndex > 0 ? line.slice(colonIndex + 1).trim() : "";
    const looksLikeCategory =
      Boolean(prefix) && suffix.length > 0 && /^[A-Za-z][A-Za-z0-9 &/+().,'-]{1,60}$/.test(prefix);

    if (looksLikeCategory) {
      flush();
      currentCategory = prefix;
      currentValue = suffix;
      continue;
    }

    if (currentCategory) {
      currentValue = `${currentValue} ${line}`.trim();
    }
  }

  flush();
  return categories.filter((entry) => entry.category || entry.skills.length > 0);
}

function parseFlatSkills(lines: string[]) {
  return lines
    .flatMap((line) =>
      normalizeWhitespace(line)
        .replace(/&amp;/g, "&")
        .split(/[\u2022;|]/g)
        .flatMap((segment) => segment.split(/,\s+/g))
        .map((segment) => normalizeWhitespace(segment).replace(/\s*-\s*/g, "-"))
    )
    .filter(Boolean);
}

function parseExperienceBlock(block: string[], literalMode = false): ResumeExperience | null {
  const lines = block.map((line) => normalizeWhitespace(line)).filter(Boolean).filter((line) => !isPaginationLine(line));
  if (lines.length === 0) return null;

  const headerLine = lines[0] || "";
  const companyLine = lines[1] || "";
  const bodyLines = lines.slice(2);
  const headerParts = headerLine.split("|").map((part) => normalizeWhitespace(part)).filter(Boolean);
  let role = "";
  let duration = "";
  let companyFromHeader = "";

  if (headerParts.length >= 2) {
    role = headerParts[0] || "";
    const rightSide = headerParts.slice(1).join(" | ");
    const companySplit = splitRoleAndDuration(rightSide);
    companyFromHeader = companySplit.role;
    duration = companySplit.duration;
  } else {
    const split = splitRoleAndDuration(headerLine);
    role = split.role;
    duration = split.duration;
  }

  const hasFreeformBody =
    duration === "" &&
    lines.length > 1 &&
    lines.slice(1).every((line) => looksLikeStandaloneExperienceTitleLine(line) || isBulletLine(line));
  const companyLocation = hasFreeformBody ? { company: "", location: "" } : splitCompanyLocation(companyLine);
  const company = companyFromHeader || companyLocation.company;
  const location = companyFromHeader ? normalizeWhitespace(companyLine) : companyLocation.location;
  const bulletsSource = hasFreeformBody ? lines.slice(1) : bodyLines;
  const bullets = literalMode ? collectLiteralBullets(bulletsSource) : groupParagraphLines(bulletsSource);
  const rawHeader = compactJoin([role, company, duration, location].filter(Boolean), " | ");

  return {
    company,
    role,
    duration,
    location,
    bullets,
    rawHeader
  };
}

function parseEducationBlock(block: string[], literalMode = false): ResumeEducation | null {
  const lines = block.map((line) => normalizeWhitespace(line)).filter(Boolean).filter((line) => !isPaginationLine(line));
  if (lines.length === 0) return null;

  const rawLine = compactJoin(lines, " | ");
  const firstLine = lines[0] || "";
  const secondLine = lines[1] || "";
  const firstLooksLikeDegree =
    /(bachelor|master|associate|phd|doctor|degree|diploma|certificate|computer science|engineering|science|arts|business)/i.test(
      firstLine
    );
  const secondLooksLikeDegree =
    /(bachelor|master|associate|phd|doctor|degree|diploma|certificate|computer science|engineering|science|arts|business)/i.test(
      secondLine
    );

  let school = firstLine;
  let degreeLine = secondLine;
  let duration = lines.find((line) => isLikelyDateText(line)) || "";

  if (firstLooksLikeDegree && secondLine) {
    const split = splitDegreeAndDuration(firstLine);
    degreeLine = split.degree;
    duration = split.duration || duration;
    school = secondLine;
  } else if (secondLooksLikeDegree && firstLine && !firstLooksLikeDegree) {
    school = firstLine;
    const split = splitDegreeAndDuration(secondLine);
    degreeLine = split.degree;
    duration = split.duration || duration;
  }

  const schoolLocation = splitCompanyLocation(school);
  school = schoolLocation.company;
  const location = schoolLocation.location || lines.find((line) => /,/.test(line) && !isLikelyDateText(line)) || "";
  const details = literalMode ? collectLiteralBullets(lines.slice(2)) : groupParagraphLines(lines.slice(2));

  return {
    school,
    degree: degreeLine,
    duration,
    location,
    details,
    rawLine
  };
}

function splitBySection(lines: string[]) {
  const buckets: Record<SectionKey, string[]> = {
    summary: [],
    skills: [],
    experience: [],
    education: [],
    certificates: []
  };

  let current: SectionKey | null = null;

  for (const line of lines) {
    if (isPaginationLine(line)) {
      continue;
    }

    const section = detectSection(line);
    if (section) {
      current = section;
      continue;
    }

    if (!current) continue;
    buckets[current].push(line);
  }

  return buckets;
}

function splitExperienceEntries(lines: string[]) {
  const entries: string[][] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (!line || isPaginationLine(line)) {
      continue;
    }

    if (looksLikeExperienceHeaderLine(line) && current.length > 0) {
      entries.push(current);
      current = [line];
      continue;
    }

    if (
      looksLikeStandaloneExperienceTitleLine(line) &&
      current.length > 0 &&
      (current.length >= 2 || looksLikeStandaloneExperienceTitleLine(current[0] || ""))
    ) {
      entries.push(current);
      current = [line];
      continue;
    }

    if (current.length === 0) {
      current.push(line);
      continue;
    }

    current.push(line);
  }

  if (current.length > 0) {
    entries.push(current);
  }

  return entries
    .flatMap((entry) => {
      const cleaned = entry.map((line) => normalizeWhitespace(line)).filter(Boolean);
      if (
        cleaned.length > 1 &&
        cleaned.every((line) => !looksLikeExperienceHeaderLine(line)) &&
        cleaned.every((line) => !isBulletLine(line)) &&
        cleaned.every((line) => looksLikeStandaloneExperienceTitleLine(line))
      ) {
        return cleaned.map((line) => [line]);
      }

      return [cleaned];
    })
    .filter((entry) => entry.length > 0);
}

function splitEducationEntries(lines: string[]) {
  const entries: string[][] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (!line || isPaginationLine(line)) {
      continue;
    }

    const looksLikeEducationStart = looksLikeEducationStartLine(line);

    if (looksLikeEducationStart && current.length > 0) {
      entries.push(current);
      current = [line];
      continue;
    }

    if (current.length === 0) {
      current.push(line);
      continue;
    }

    current.push(line);
  }

  if (current.length > 0) {
    entries.push(current);
  }

  return entries.filter((entry) => entry.length > 0);
}

export function parseResumeText(input: {
  text: string;
  fileType?: string;
  candidateName?: string;
}): ParsedResume {
  const text = unwrapResumeContainerText(input.text);
  const structuredResume = extractStructuredResumeFromText(text, input.candidateName || "");
  const literalMode = input.fileType === "text/plain" || looksLikePromptTemplateText(text);
  const rawLines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const headerMetadata = extractHeaderMetadata(rawLines.slice(0, 30));
  if (structuredResume) {
    return ParsedResumeSchema.parse({
      ...structuredResume,
      name: headerMetadata.name || structuredResume.name,
      title: headerMetadata.title || structuredResume.title,
      contact: {
        ...structuredResume.contact,
        email: headerMetadata.email || structuredResume.contact?.email || "",
        phone: headerMetadata.phone || structuredResume.contact?.phone || "",
        location: headerMetadata.location || structuredResume.contact?.location || "",
        linkedin: headerMetadata.linkedin || structuredResume.contact?.linkedin || "",
        github: headerMetadata.github || structuredResume.contact?.github || "",
        website: headerMetadata.website || structuredResume.contact?.website || ""
      }
    });
  }

  const lines = rawLines.filter((line) => line && !isPaginationLine(line));
  const sectionStartIndex = lines.findIndex((line) => isSectionHeading(line));
  const headerLines = sectionStartIndex >= 0 ? lines.slice(0, sectionStartIndex) : lines;
  const buckets = splitBySection(lines);

  const fallbackName = extractCandidateNameFromResumeText(text) || input.candidateName || "";
  const { name, title } = extractNameAndTitle(headerLines, fallbackName);
  const contact = extractContact(headerLines.concat(lines.slice(0, Math.min(lines.length, 12))));

  const summarySource =
    buckets.summary.length > 0
      ? buckets.summary
      : headerLines.filter((line) => {
          const trimmed = line.trim();
          return (
            trimmed &&
            trimmed !== name &&
            trimmed !== title &&
            !/[@]|https?:\/\//i.test(trimmed) &&
            !/\b(email|phone|linkedin|github|portfolio|address|location)\b/i.test(trimmed) &&
            !isLikelyDateText(trimmed)
          );
        });

  const summary = normalizeWhitespace(summarySource.join(" "));
  const skillCategories = parseSkillCategories(buckets.skills);
  const skills = skillCategories.length > 0 ? skillCategories.flatMap((entry) => entry.skills) : parseFlatSkills(buckets.skills);
  const experience = splitExperienceEntries(buckets.experience)
    .map((entry) => parseExperienceBlock(entry, literalMode))
    .filter((item): item is ResumeExperience => Boolean(item));
  const education = splitEducationEntries(buckets.education)
    .map((entry) => parseEducationBlock(entry, literalMode))
    .filter((item): item is ResumeEducation => Boolean(item));
  const suppressCertificates = looksLikePromptTemplateText(text) || looksLikeResumeInstructionText(text);
  const certificates = suppressCertificates
    ? []
    : splitBlocks(buckets.certificates)
        .filter((block) => looksLikeRealCertificationEntry(block.join(" ")))
        .flatMap((block) => parseFlatSkills(block))
        .map((certificate) => normalizeWhitespace(certificate))
        .filter((certificate) => looksLikeRealCertificationEntry(certificate));

  const detectedSections = [summary, skills.length, experience.length, education.length, certificates.length].filter(Boolean)
    .length;

  const confidence = Math.min(0.98, 0.35 + detectedSections * 0.11 + (name ? 0.1 : 0) + (title ? 0.05 : 0));

  return ParsedResumeSchema.parse({
    name,
    title,
    summary,
    skills,
    skillCategories,
    experience,
    education,
    certificates,
    contact,
    sourceMeta: {
      parserVersion: "2.1",
      fileType: input.fileType || "extracted-text",
      confidence
    }
  });
}
