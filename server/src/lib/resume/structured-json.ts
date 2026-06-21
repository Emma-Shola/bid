import { ParsedResumeSchema, type ParsedResume, type ResumeEducation, type ResumeExperience, type ResumeSkillCategory } from "./types";
import { compactJoin, dedupeStrings, isBulletLine, isLikelyDateText, normalizeWhitespace, splitBlocks, stripBulletMarker } from "./shared";
import { looksLikeRealCertificationEntry } from "./content-signals";

function asString(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return "";
}

function getStringArray(value: unknown): string[] {
  return asArray(value)
    .flatMap((item) => {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        return [String(item).trim()];
      }
      if (item && typeof item === "object") {
        const object = item as Record<string, unknown>;
        const valueText = firstNonEmptyString(object.value, object.text, object.label, object.name);
        const nested = getStringArray(object.skills ?? object.items ?? object.values ?? object.tech ?? object.tools ?? object.tags);
        return [valueText, ...nested];
      }
      return [];
    })
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
}

function extractBalancedJsonObjects(text: string) {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

function collectResumeBullets(value: unknown) {
  return asArray(value)
    .flatMap((item) => {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        const text = normalizeWhitespace(String(item));
        if (!text) return [];
        if (/\n/.test(text)) {
          return text
            .split(/\n+/)
            .map((part) => part.trim())
            .filter(Boolean);
        }
        return [text];
      }

      if (item && typeof item === "object") {
        const object = item as Record<string, unknown>;
        const text = firstNonEmptyString(object.bullet, object.text, object.description, object.value, object.summary, object.detail);
        if (text) {
          return [text];
        }
      }

      return [];
    })
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
}

function parseSkillCategories(rawSkills: unknown): ResumeSkillCategory[] {
  if (!rawSkills) {
    return [];
  }

  if (Array.isArray(rawSkills)) {
    const categories: ResumeSkillCategory[] = [];

    for (const item of rawSkills) {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        continue;
      }

      if (!item || typeof item !== "object") {
        continue;
      }

      const object = item as Record<string, unknown>;
      const category = firstNonEmptyString(object.category, object.name, object.label, object.title);
      const skills = dedupeStrings(
        getStringArray(object.skills ?? object.items ?? object.values ?? object.tech ?? object.tools ?? object.tags)
      );
      const value = firstNonEmptyString(object.value, object.text);

      if (category && skills.length > 0) {
        categories.push({ category, skills });
        continue;
      }

      if (category && value) {
        categories.push({
          category,
          skills: value
            .split(/[,;|]/g)
            .map((part) => normalizeWhitespace(part))
            .filter(Boolean)
        });
      }
    }

    return categories;
  }

  if (typeof rawSkills === "object") {
    return Object.entries(rawSkills as Record<string, unknown>)
      .map(([category, value]) => ({
        category: normalizeWhitespace(category),
        skills: dedupeStrings(getStringArray(value))
      }))
      .filter((entry) => entry.category || entry.skills.length > 0);
  }

  return [];
}

function parseExperienceItem(raw: unknown): ResumeExperience | null {
  const object = asObject(raw);
  const role = firstNonEmptyString(object.role, object.title, object.position);
  const company = firstNonEmptyString(object.company, object.employer, object.organization, object.name);
  const duration = firstNonEmptyString(object.duration, object.date, object.period, object.timeline);
  const location = firstNonEmptyString(object.location, object.work_location, object.city, object.region);
  const bullets = collectResumeBullets(object.bullets ?? object.responsibilities ?? object.achievements ?? object.details ?? object.description);

  if (!role && !company && bullets.length === 0) {
    return null;
  }

  return {
    company,
    role,
    duration,
    location,
    bullets,
    rawHeader: compactJoin([role, company, duration, location].filter(Boolean), " | ")
  };
}

function parseEducationItem(raw: unknown): ResumeEducation | null {
  const object = asObject(raw);

  const school = firstNonEmptyString(object.school, object.institution, object.university, object.college, object.name);
  const degree = firstNonEmptyString(object.degree, object.qualification, object.major, object.program);
  const duration = firstNonEmptyString(object.duration, object.date, object.period, object.timeline);
  const location = firstNonEmptyString(object.location, object.city, object.state);
  const details = collectResumeBullets(object.details ?? object.bullets ?? object.notes);

  if (!school && !degree && details.length === 0) {
    return null;
  }

  return {
    school,
    degree,
    duration,
    location,
    details,
    rawLine: compactJoin([school, degree, duration, location].filter(Boolean), " | ")
  };
}

function parseCertificates(raw: unknown) {
  return asArray(raw)
    .flatMap((item) => {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        const text = normalizeWhitespace(String(item));
        return looksLikeRealCertificationEntry(text) ? [text] : [];
      }

      const object = asObject(item);
      const name = firstNonEmptyString(object.name, object.title, object.certificate);
      const issuer = firstNonEmptyString(object.publisher, object.issuer, object.organization, object.company);

      if (name && issuer) {
        const text = normalizeWhitespace(`${name} | ${issuer}`);
        return looksLikeRealCertificationEntry(text) ? [text] : [];
      }

      return name && looksLikeRealCertificationEntry(name) ? [name] : [];
    })
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
}

function scoreStructuredCandidate(candidate: Record<string, unknown>) {
  let score = 0;
  const summary = firstNonEmptyString(candidate.summary, candidate.professionalSummary, candidate.profile, candidate.objective);
  const experience = Array.isArray(candidate.experience) ? candidate.experience : [];
  const skills = candidate.skills;
  const education = candidate.education;
  const certificates = candidate.certificates ?? candidate.certifications;

  if (summary) score += 4;
  if (experience.length > 0) score += 5;
  if (skills) score += 4;
  if (education) score += 2;
  if (certificates) score += 1;
  if (candidate.contact || candidate.email || candidate.phone || candidate.address || candidate.location) score += 1;
  if (candidate.name || candidate.fullName) score += 1;
  if (candidate.title || candidate.role) score += 1;

  if (candidate.applicant && candidate.body_paragraphs && !experience.length && !skills && !education) {
    score -= 8;
  }

  if (candidate.body_paragraphs && candidate.closing && !experience.length && !skills && !education) {
    score -= 8;
  }

  if (summary && /above is job description|following is current resume|insert strong headline|base json format|give me my resume/i.test(summary)) {
    score -= 6;
  }

  return score;
}

function parseStructuredResumeCandidate(candidate: Record<string, unknown>, fallbackName = ""): ParsedResume | null {
  const score = scoreStructuredCandidate(candidate);
  if (score < 6) {
    return null;
  }

  const contactObject = asObject(candidate.contact);
  const githubValue = contactObject.github ?? candidate.github;
  const github = Array.isArray(githubValue) ? asString(githubValue[0]) : asString(githubValue);
  const location = firstNonEmptyString(contactObject.location, contactObject.address, candidate.location, candidate.address);
  const summary = firstNonEmptyString(candidate.summary, candidate.professionalSummary, candidate.profile, candidate.objective);
  const title = firstNonEmptyString(candidate.title, candidate.role, candidate.headline, candidate.position);
  const name = firstNonEmptyString(candidate.name, candidate.fullName, contactObject.name, candidate.full_name, fallbackName);
  const skillCategories = parseSkillCategories(candidate.skills);
  const flatSkills = skillCategories.length > 0 ? skillCategories.flatMap((entry) => entry.skills) : getStringArray(candidate.skills);

  const experience = asArray(candidate.experience)
    .map(parseExperienceItem)
    .filter((item): item is ResumeExperience => Boolean(item));

  const educationValue = candidate.education;
  const education = Array.isArray(educationValue)
    ? educationValue.map(parseEducationItem).filter((item): item is ResumeEducation => Boolean(item))
    : parseEducationItem(educationValue)
      ? [parseEducationItem(educationValue)!]
      : [];

  const certificates = parseCertificates(candidate.certificates ?? candidate.certifications);

  const resume = ParsedResumeSchema.parse({
    name,
    title,
    summary,
    skills: dedupeStrings([...flatSkills, ...getStringArray(candidate.skills)]),
    skillCategories,
    experience,
    education,
    certificates,
    contact: {
      email: firstNonEmptyString(contactObject.email, candidate.email),
      phone: firstNonEmptyString(contactObject.phone, candidate.phone),
      location,
      linkedin: firstNonEmptyString(contactObject.linkedin, candidate.linkedin),
      github,
      website: firstNonEmptyString(contactObject.website, candidate.website)
    },
    sourceMeta: {
      parserVersion: "2.0",
      fileType: "structured-json",
      confidence: Math.min(0.99, 0.75 + score / 20)
    }
  });

  return resume;
}

export function extractStructuredResumeFromText(text: string, fallbackName = ""): ParsedResume | null {
  const candidates = extractBalancedJsonObjects(text);
  let best: { score: number; resume: ParsedResume } | null = null;

  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const resume = parseStructuredResumeCandidate(parsed, fallbackName);
      if (!resume) {
        continue;
      }

      const score = scoreStructuredCandidate(parsed);
      if (!best || score > best.score) {
        best = { score, resume };
      }
    } catch {
      continue;
    }
  }

  return best?.resume ?? null;
}


