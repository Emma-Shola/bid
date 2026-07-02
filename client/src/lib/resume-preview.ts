import { RESUME_RENDER_TOKENS } from "@/resume-rendering";

export type ResumePreviewSectionKey = "summary" | "skills" | "experience" | "education" | "certificates";

export type ResumePreviewContact = {
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
};

export type ResumePreviewExperience = {
  company: string;
  role: string;
  duration: string;
  location?: string;
  bullets: string[];
  rawHeader?: string;
};

export type ResumePreviewEducation = {
  school: string;
  degree: string;
  duration: string;
  location?: string;
  details: string[];
  rawLine?: string;
};

export type ResumePreviewSource = {
  name: string;
  title: string;
  summary: string;
  skills: string[];
  skillCategories?: ResumePreviewSkillCategory[];
  experience: ResumePreviewExperience[];
  education: ResumePreviewEducation[];
  certificates: string[];
  contact?: ResumePreviewContact | null;
};

export type ResumePreviewSkillCategory = {
  category: string;
  skills: string[];
};

export type ResumePreviewTailoredExperience = {
  company: string;
  role: string;
  duration: string;
  bullets: string[];
};

export type ResumePreviewTailored = {
  summary: string;
  tailoredSkills: string[];
  tailoredExperience: ResumePreviewTailoredExperience[];
  atsKeywordsUsed?: string[];
  missingKeywords?: string[];
  confidenceNotes?: string[];
};

export type ResumePreviewJobAnalysis = {
  title: string;
  company: string;
  domain: string;
  seniority: "junior" | "mid" | "senior" | "staff" | "principal";
  keywords: string[];
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
};

export type GeneratedResumeStructured = {
  source: ResumePreviewSource;
  jobAnalysis?: ResumePreviewJobAnalysis;
  tailored: ResumePreviewTailored;
};

export type ResumePreviewExperienceItem = {
  role: string;
  company: string;
  duration: string;
  location: string;
  bullets: string[];
};

export type ResumePreviewEducationItem = {
  school: string;
  degree: string;
  duration: string;
  location: string;
  details: string[];
};

export type ResumePreviewModel = {
  name: string;
  title: string;
  contactLine: string;
  linksLine: string;
  summary: string;
  skillCategories: ResumePreviewSkillCategory[];
  skills: string[];
  experience: ResumePreviewExperienceItem[];
  education: ResumePreviewEducationItem[];
  certificates: string[];
};

export const RESUME_PREVIEW_TEMPLATE = {
  sectionOrder: ["summary", "experience", "education", "certificates", "skills"] as const,
  separators: {
    entry: " | ",
  },
  typography: RESUME_RENDER_TOKENS.typography,
  composition: RESUME_RENDER_TOKENS.composition,
  layout: {
    pageWidth: 794,
    pageHeight: 1123,
    maxWidth: 794,
    contentPaddingX: 16,
    contentPaddingY: 16,
  },
} as const;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function compactJoin(values: Array<string | null | undefined>, separator: string = RESUME_PREVIEW_TEMPLATE.separators.entry) {
  return values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(separator)
    .trim();
}

function normalizeList(values: string[]) {
  return values.map((value) => normalizeText(value)).filter(Boolean);
}

const SKILL_CATEGORY_ORDER = [
  "Languages",
  "Backend",
  "Frontend",
  "Frameworks",
  "Databases",
  "Cloud & DevOps",
  "Observability",
  "Architecture & Practices",
  "Tools",
  "Methodologies",
  "Other",
];

function normalizeSkillKey(value: string) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
}

function normalizeSkillCategoryName(value: string) {
  const label = normalizeText(value).replace(/[:\-]+$/g, "").trim();
  const lowered = label.toLowerCase();

  if (/^(language|languages|programming languages?)$/.test(lowered)) return "Languages";
  if (/^(backend|back end|server|server-side|apis?)$/.test(lowered)) return "Backend";
  if (/^(frontend|front end|client|client-side|ui)$/.test(lowered)) return "Frontend";
  if (/^(framework|frameworks|libraries?)$/.test(lowered)) return "Frameworks";
  if (/^(database|databases|data stores?|storage)$/.test(lowered)) return "Databases";
  if (/^(cloud|cloud platforms?|devops|cloud & devops|infrastructure)$/.test(lowered)) return "Cloud & DevOps";
  if (/^(observability|monitoring|logging)$/.test(lowered)) return "Observability";
  if (/^(architecture|architecture & practices|practices|engineering practices?)$/.test(lowered)) return "Architecture & Practices";
  if (/^(tool|tools|platforms?)$/.test(lowered)) return "Tools";
  if (/^(methodology|methodologies|process|processes)$/.test(lowered)) return "Methodologies";

  return label || "Other";
}

function splitSkillValues(value: string) {
  return normalizeText(value)
    .split(/\s*(?:,|;|\||\/|•)\s*/g)
    .map((skill) => skill.replace(/^[-–—•]\s*/g, "").trim())
    .filter(Boolean);
}

function parseSkillLine(value: string): ResumePreviewSkillCategory | null {
  const line = normalizeText(value);
  const match = line.match(/^([^:]{2,42}):\s*(.+)$/);
  if (!match) return null;

  const category = normalizeSkillCategoryName(match[1] ?? "");
  const skills = splitSkillValues(match[2] ?? "");
  return skills.length ? { category, skills } : null;
}

function classifySkill(value: string) {
  const skill = normalizeSkillKey(value);

  if (/\b(type)?script|javascript|python|java|golang|go|c\+\+|c#|ruby|php|scala|kotlin|swift|sql|html|css\b/i.test(skill)) return "Languages";
  if (/\breact|next\.?js|vue|angular|redux|tailwind|html|css|frontend|front end|ui\b/i.test(skill)) return "Frontend";
  if (/\bnode|express|nestjs|fastapi|django|flask|spring|graphql|rest|grpc|microservices?|apis?\b/i.test(skill)) return "Backend";
  if (/\bpostgres|postgresql|mysql|mongodb|redis|dynamodb|snowflake|bigquery|redshift|sql server|oracle|elasticsearch\b/i.test(skill)) return "Databases";
  if (/\baws|azure|gcp|docker|kubernetes|terraform|helm|jenkins|github actions|gitlab ci|ci\/cd|serverless|lambda|ecs|eks|cloudformation\b/i.test(skill)) return "Cloud & DevOps";
  if (/\bdatadog|prometheus|grafana|new relic|splunk|elk|opentelemetry|observability|monitoring|logging\b/i.test(skill)) return "Observability";
  if (/\bagile|scrum|kanban|tdd|bdd|code review|system design|architecture|distributed systems|security|performance|scalability|reliability\b/i.test(skill)) return "Architecture & Practices";

  return "Tools";
}

function pushSkill(groups: Map<string, string[]>, used: Set<string>, category: string, skill: string) {
  const cleanSkill = normalizeText(skill);
  const key = normalizeSkillKey(cleanSkill);
  if (!cleanSkill || used.has(key)) return;

  const cleanCategory = normalizeSkillCategoryName(category);
  groups.set(cleanCategory, [...(groups.get(cleanCategory) ?? []), cleanSkill]);
  used.add(key);
}

function groupSkillsByClassification(skills: string[]): ResumePreviewSkillCategory[] {
  const groups = new Map<string, string[]>();
  const used = new Set<string>();

  for (const raw of skills) {
    // The model is prompted to emit tailoredSkills as "Category: skill, skill"
    // lines. Split that label back out first, otherwise the whole line gets
    // classified and stored as a single skill under its own category, e.g.
    // "Languages: Languages: Python, TypeScript, SQL".
    const parsedLine = parseSkillLine(raw);
    if (parsedLine) {
      for (const skill of parsedLine.skills) {
        pushSkill(groups, used, parsedLine.category, skill);
      }
      continue;
    }
    pushSkill(groups, used, classifySkill(raw), raw);
  }

  return SKILL_CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => ({
    category,
    skills: groups.get(category) ?? []
  }));
}

function buildSkillCategories(categories: ResumePreviewSkillCategory[], tailoredSkills: string[]) {
  const priority = new Map(
    tailoredSkills.map((skill, index) => [normalizeText(skill).toLowerCase(), index])
  );
  const used = new Set<string>();
  const rendered: ResumePreviewSkillCategory[] = [];

  for (const category of categories) {
    const skills = normalizeList(category.skills)
      .filter((skill) => !used.has(skill.toLowerCase()))
      .sort((left, right) => {
        const leftIndex = priority.has(left.toLowerCase()) ? (priority.get(left.toLowerCase()) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        const rightIndex = priority.has(right.toLowerCase()) ? (priority.get(right.toLowerCase()) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
      });

    if (!skills.length) {
      continue;
    }

    rendered.push({
      category: normalizeText(category.category) || "Skills",
      skills
    });
    skills.forEach((skill) => used.add(skill.toLowerCase()));
  }

  const extras = tailoredSkills
    .map((skill) => normalizeText(skill))
    .filter(Boolean)
    .filter((skill) => !used.has(skill.toLowerCase()));

  if (extras.length > 0) {
    rendered.push({
      category: "Additional Relevant Skills",
      skills: extras
    });
  }

  return rendered;
}

function dedupeExperience(items: ResumePreviewExperienceItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [item.role, item.company, item.duration, item.location].map(normalizeSkillKey).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(item.role || item.company || item.duration || item.location || item.bullets.length);
  });
}

const DATE_PART_PATTERN = String.raw`(?:(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s*)?(?:19|20)\d{2}|(?:0?[1-9]|1[0-2])\/(?:19|20)?\d{2}|Present|Current|Now)`;
const DATE_RANGE_PATTERN = new RegExp(
  String.raw`\b${DATE_PART_PATTERN}\s*(?:-|–|—|to)\s*${DATE_PART_PATTERN}\b`,
  "gi"
);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looksLikeLocation(value: string) {
  return /^([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+)*,\s*[A-Z]{2}(?:\s+\d{5})?)$/i.test(
    normalizeText(value)
  );
}

function stripDateRanges(value: string) {
  return normalizeText(value.replace(DATE_RANGE_PATTERN, " ").replace(/\s*(?:\||-|–|—|,)\s*$/g, ""));
}

function cleanRepeatedPhrase(value: string) {
  let output = normalizeText(value);
  const parts = output.split(/\s+/);
  if (parts.length % 2 === 0) {
    const midpoint = parts.length / 2;
    const first = parts.slice(0, midpoint).join(" ");
    const second = parts.slice(midpoint).join(" ");
    if (normalizeSkillKey(first) === normalizeSkillKey(second)) output = first;
  }
  return output.replace(/\b(.{4,80})\s+\1\b/gi, "$1").trim();
}

function stripCandidateName(value: string, candidateName: string) {
  let output = normalizeText(value);
  const nameParts = normalizeText(candidateName).split(/\s+/).filter((part) => part.length > 1);
  const candidates = [
    normalizeText(candidateName),
    nameParts.slice(0, 2).join(" "),
    nameParts[0] ?? "",
    nameParts.slice(-1)[0] ?? "",
  ].filter(Boolean);

  for (const name of candidates) {
    const escaped = escapeRegExp(name);
    output = output
      .replace(new RegExp(`^${escaped}\\s+`, "i"), "")
      .replace(new RegExp(`\\s+${escaped}$`, "i"), "")
      .trim();
  }
  return output;
}

function cleanDelimitedMetadata(value: string, removableParts: string[]) {
  let output = normalizeText(value);
  for (const part of removableParts.map(normalizeText).filter(Boolean)) {
    const escaped = escapeRegExp(part);
    output = output
      .replace(new RegExp(`\\s*(?:\\||-|–|—|,)\\s*${escaped}\\s*$`, "i"), "")
      .replace(new RegExp(`^\\s*${escaped}\\s*(?:\\||-|–|—|,)\\s*`, "i"), "")
      .trim();
  }
  return output;
}

function splitCompanyAndLocation(value: string) {
  const cleaned = cleanRepeatedPhrase(normalizeText(value).replace(/\s+[-–—]\s+/g, " - "));
  const sentenceParts = cleaned.split(/\.\s+/).map((part) => part.trim()).filter(Boolean);
  const likelyCompanyLine = sentenceParts.length > 1 ? sentenceParts[sentenceParts.length - 1] : cleaned;
  const match = likelyCompanyLine.match(/^(.+?)\s+(?:-|–|—|\||·)\s+(.+)$/);

  if (match) {
    const company = normalizeText(match[1] ?? "");
    const maybeLocation = normalizeText(match[2] ?? "");
    if (company && looksLikeLocation(maybeLocation)) return { company, location: maybeLocation };
  }

  return { company: likelyCompanyLine, location: "" };
}

function cleanContactLocation(value: string) {
  const location = normalizeText(value);
  if (!location) return "";
  return looksLikeLocation(location) ? location : "";
}

function looksLikeRenderableCertificate(value: string) {
  const text = normalizeText(value);
  if (!text || /^(certificates?|certifications?|licenses?)$/i.test(text)) return false;

  return /\b(certified|certification|certificate|licensed|license|aws certified|aws solutions architect|microsoft certified|azure fundamentals|google cloud certified|professional cloud|oracle certified|ccna|cisco|comptia|security\+|network\+|pmp|cissp|cisa|ceh|cka|ckad|itil|scrum master|scrummaster|salesforce certified|databricks|snowpro)\b/i.test(text);
}

export function buildResumePreviewModel(structured: GeneratedResumeStructured): ResumePreviewModel {
  const source = structured.source;
  const tailored = structured.tailored;
  const candidateName = normalizeText(source.name) || "Candidate";
  const tailoredSkills = normalizeList(tailored.tailoredSkills);
  const classifiedCategories = groupSkillsByClassification(tailoredSkills);
  const skillCategories = buildSkillCategories(classifiedCategories, tailoredSkills);

  return {
    name: candidateName,
    title: normalizeText(structured.jobAnalysis?.title || source.title),
    contactLine: compactJoin([
      source.contact?.email,
      source.contact?.phone,
      cleanContactLocation(source.contact?.location || ""),
    ], " | "),
    linksLine: compactJoin([
      source.contact?.linkedin,
      source.contact?.github,
      source.contact?.website,
    ], " | "),
    summary: normalizeText(tailored.summary),
    skillCategories,
    skills: Array.from(new Set(tailoredSkills.map((skill) => normalizeText(skill)).filter(Boolean))),
    experience: dedupeExperience(source.experience.map((item, index) => {
      const durationFromRole = normalizeText(item.role.match(DATE_RANGE_PATTERN)?.[0] ?? "");
      const duration = cleanDelimitedMetadata(item.duration || durationFromRole, [item.role, item.company, item.location]);
      const role = cleanRepeatedPhrase(stripDateRanges(cleanDelimitedMetadata(item.role, [duration, item.company, item.location])));
      const companyInput = stripCandidateName(cleanDelimitedMetadata(item.company, [duration, item.role, item.location]), candidateName);
      const companySplit = splitCompanyAndLocation(companyInput);
      const locationInput = cleanDelimitedMetadata(item.location || companySplit.location, [role, item.company, duration]);

      return {
        role,
        company: cleanRepeatedPhrase(stripDateRanges(companySplit.company)),
        duration,
        location: looksLikeLocation(locationInput) ? locationInput : companySplit.location,
        bullets: normalizeList(tailored.tailoredExperience[index]?.bullets ?? []),
      };
    })),
    education: source.education.map((item) => ({
      school: normalizeText(item.school),
      degree: normalizeText(item.degree),
      duration: normalizeText(item.duration),
      location: normalizeText(item.location),
      details: normalizeList(item.details),
    })),
    certificates: normalizeList(source.certificates).filter(looksLikeRenderableCertificate),
  };
}




