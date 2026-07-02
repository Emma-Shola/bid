import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import { buildFallbackTailoredResume } from "./validator";
import { normalizeParsedResume } from "./normalizer";
import { parseResumeText } from "./parser";
import { compactJoin, dedupeStrings, normalizeKeyword, normalizeWhitespace } from "./shared";
import { type ParsedResume, type ResumeSkillCategory, type TailoredResume } from "./types";
import { ATS_CLASSIC_TEMPLATE, ResumePdfDocument } from "./template-engine";

export type ResumeExportExperience = {
  role: string;
  company: string;
  duration: string;
  location: string;
  bullets: string[];
};

export type ResumeExportEducation = {
  school: string;
  degree: string;
  duration: string;
  location: string;
  details: string[];
};

export type ResumeExportModel = {
  name: string;
  title: string;
  contactLine: string;
  linksLine: string;
  summary: string;
  skillCategories: ResumeExportSkillCategory[];
  skills: string[];
  experience: ResumeExportExperience[];
  education: ResumeExportEducation[];
  certificates: string[];
};

export type ResumeExportSkillCategory = {
  category: string;
  skills: string[];
};

function normalizeLines(lines: string[]) {
  return lines.map((line) => normalizeWhitespace(line)).filter(Boolean);
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
  "Other"
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSkillCategoryName(value: string) {
  const label = normalizeWhitespace(value).replace(/[:\-]+$/g, "").trim();
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
  return normalizeWhitespace(value)
    .split(/\s*(?:,|;|\||\/|\u2022)\s*/g)
    .map((skill) => skill.replace(/^[-–—•]\s*/g, "").trim())
    .filter(Boolean);
}

function parseSkillLine(value: string): ResumeExportSkillCategory | null {
  const line = normalizeWhitespace(value);
  const match = line.match(/^([^:]{2,42}):\s*(.+)$/);
  if (!match) return null;

  const category = normalizeSkillCategoryName(match[1] ?? "");
  const skills = splitSkillValues(match[2] ?? "");
  return skills.length > 0 ? { category, skills } : null;
}

function classifySkill(value: string) {
  const skill = normalizeWhitespace(value);
  const normalized = normalizeKeyword(skill);

  if (/\b(type)?script|javascript|python|java|golang|go|c\+\+|c#|ruby|php|scala|kotlin|swift|sql|html|css\b/i.test(normalized)) {
    return "Languages";
  }

  if (/\breact|next\.?js|vue|angular|redux|tailwind|html|css|frontend|front-end|ui\b/i.test(normalized)) {
    return "Frontend";
  }

  if (/\bnode|express|nestjs|fastapi|django|flask|spring|graphql|rest|grpc|microservices?|apis?\b/i.test(normalized)) {
    return "Backend";
  }

  if (/\bpostgres|postgresql|mysql|mongodb|redis|dynamodb|snowflake|bigquery|redshift|sql server|oracle|elasticsearch\b/i.test(normalized)) {
    return "Databases";
  }

  if (/\baws|azure|gcp|docker|kubernetes|terraform|helm|jenkins|github actions|gitlab ci|ci\/cd|serverless|lambda|ecs|eks|cloudformation\b/i.test(normalized)) {
    return "Cloud & DevOps";
  }

  if (/\bdatadog|prometheus|grafana|new relic|splunk|elk|opentelemetry|observability|monitoring|logging\b/i.test(normalized)) {
    return "Observability";
  }

  if (/\bagile|scrum|kanban|tdd|bdd|code review|system design|architecture|distributed systems|security|performance|scalability|reliability\b/i.test(normalized)) {
    return "Architecture & Practices";
  }

  return "Tools";
}

function pushSkill(
  groups: Map<string, string[]>,
  used: Set<string>,
  category: string,
  skill: string
) {
  const cleanSkill = normalizeWhitespace(skill);
  const key = normalizeKeyword(cleanSkill);
  if (!cleanSkill || used.has(key)) return;

  const cleanCategory = normalizeSkillCategoryName(category);
  groups.set(cleanCategory, [...(groups.get(cleanCategory) ?? []), cleanSkill]);
  used.add(key);
}

function groupSkillsByClassification(skills: string[]): ResumeSkillCategory[] {
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

function buildSkillCategories(
  categories: ResumeSkillCategory[],
  prioritizedSkills: string[],
  coreSkills: string[] = []
): ResumeExportSkillCategory[] {
  const priority = dedupeStrings(prioritizedSkills.map((skill) => normalizeWhitespace(skill)));
  const priorityIndex = new Map(priority.map((skill, index) => [normalizeKeyword(skill), index]));
  const used = new Set<string>();
  const rendered: ResumeExportSkillCategory[] = [];

  const core = dedupeStrings(coreSkills.map((skill) => normalizeWhitespace(skill))).filter(Boolean);
  if (core.length > 0) {
    rendered.push({
      category: "Core Technical Skills",
      skills: core
    });
    core.forEach((skill) => used.add(normalizeKeyword(skill)));
  }

  for (const category of categories) {
    const skills = dedupeStrings(category.skills.map((skill) => normalizeWhitespace(skill)))
      .filter((skill) => !used.has(normalizeKeyword(skill)))
      .sort((left, right) => {
        const leftIndex = priorityIndex.get(normalizeKeyword(left)) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = priorityIndex.get(normalizeKeyword(right)) ?? Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
      });

    if (skills.length > 0) {
      rendered.push({
        category: normalizeWhitespace(category.category) || "Skills",
        skills
      });
      skills.forEach((skill) => used.add(normalizeKeyword(skill)));
    }
  }

  const extras = priority.filter((skill) => !used.has(normalizeKeyword(skill)));
  if (extras.length > 0) {
    rendered.push({
      category: "Additional Relevant Skills",
      skills: extras
    });
  }

  return rendered;
}

function cleanDelimitedMetadata(value: string, removableParts: string[]) {
  let output = normalizeWhitespace(value);
  for (const part of removableParts.map((item) => normalizeWhitespace(item)).filter(Boolean)) {
    const escaped = escapeRegExp(part);
    output = output
      .replace(new RegExp(`\\s*(?:\\||-|–|—|,)\\s*${escaped}\\s*$`, "i"), "")
      .replace(new RegExp(`^\\s*${escaped}\\s*(?:\\||-|–|—|,)\\s*`, "i"), "")
      .trim();
  }
  return output;
}

const DATE_PART_PATTERN = String.raw`(?:(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s*)?(?:19|20)\d{2}|(?:0?[1-9]|1[0-2])\/(?:19|20)?\d{2}|Present|Current|Now)`;
const DATE_RANGE_PATTERN = new RegExp(
  String.raw`\b${DATE_PART_PATTERN}\s*(?:-|–|—|to)\s*${DATE_PART_PATTERN}\b`,
  "gi"
);

function looksLikeLocation(value: string) {
  return /^([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+)*,\s*[A-Z]{2}(?:\s+\d{5})?)$/i.test(
    normalizeWhitespace(value)
  );
}

function stripDateRanges(value: string) {
  return normalizeWhitespace(value.replace(DATE_RANGE_PATTERN, " ").replace(/\s*(?:\||-|–|—|,)\s*$/g, ""));
}

function cleanRepeatedPhrase(value: string) {
  let output = normalizeWhitespace(value);
  const parts = output.split(/\s+/);
  if (parts.length % 2 === 0) {
    const midpoint = parts.length / 2;
    const first = parts.slice(0, midpoint).join(" ");
    const second = parts.slice(midpoint).join(" ");
    if (normalizeKeyword(first) === normalizeKeyword(second)) {
      output = first;
    }
  }

  return output.replace(/\b(.{4,80})\s+\1\b/gi, "$1").trim();
}

function stripCandidateName(value: string, candidateName: string) {
  let output = normalizeWhitespace(value);
  const nameParts = normalizeWhitespace(candidateName).split(/\s+/).filter((part) => part.length > 1);
  const candidates = [
    normalizeWhitespace(candidateName),
    nameParts.slice(0, 2).join(" "),
    nameParts[0] ?? "",
    nameParts.slice(-1)[0] ?? ""
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

function splitCompanyAndLocation(value: string) {
  const cleaned = cleanRepeatedPhrase(normalizeWhitespace(value).replace(/\s+[-–—]\s+/g, " - "));
  const sentenceParts = cleaned.split(/\.\s+/).map((part) => part.trim()).filter(Boolean);
  const likelyCompanyLine = sentenceParts.length > 1 ? sentenceParts[sentenceParts.length - 1] : cleaned;
  const match = likelyCompanyLine.match(/^(.+?)\s+(?:-|–|—|\||·)\s+(.+)$/);

  if (match) {
    const company = normalizeWhitespace(match[1] ?? "");
    const maybeLocation = normalizeWhitespace(match[2] ?? "");
    if (company && looksLikeLocation(maybeLocation)) {
      return { company, location: maybeLocation };
    }
  }

  return { company: likelyCompanyLine, location: "" };
}

function cleanContactLocation(value: string) {
  const location = normalizeWhitespace(value);
  if (!location) return "";
  if (looksLikeLocation(location)) return location;

  const split = splitCompanyAndLocation(location);
  // Avoid showing employer/client text in the contact row. If the field is
  // clearly "Company - City, ST", omit it rather than showing the wrong city.
  return split.company !== location && split.location ? "" : "";
}

function normalizeExportExperienceEntry(
  item: ParsedResume["experience"][number],
  bullets: string[],
  candidateName: string
): ResumeExportExperience | null {
  const durationFromRole = normalizeWhitespace(item.role.match(DATE_RANGE_PATTERN)?.[0] ?? "");
  const duration = cleanDelimitedMetadata(item.duration || durationFromRole, [item.role, item.company, item.location]);
  const role = cleanRepeatedPhrase(stripDateRanges(cleanDelimitedMetadata(item.role, [duration, item.company, item.location])));
  const companyInput = stripCandidateName(cleanDelimitedMetadata(item.company, [duration, item.role, item.location]), candidateName);
  const companySplit = splitCompanyAndLocation(companyInput);
  const locationInput = cleanDelimitedMetadata(item.location || companySplit.location, [role, item.company, duration]);
  const company = cleanRepeatedPhrase(stripDateRanges(companySplit.company));
  const location = looksLikeLocation(locationInput) ? locationInput : companySplit.location;
  const cleanBullets = dedupeStrings(normalizeLines(bullets));

  if (!role && !company && !duration && !location && cleanBullets.length === 0) {
    return null;
  }

  return {
    role,
    company,
    duration,
    location,
    bullets: cleanBullets
  };
}

function normalizeExportExperience(
  sourceExperience: ParsedResume["experience"],
  tailored: TailoredResume,
  candidateName: string
) {
  const seen = new Set<string>();
  const output: ResumeExportExperience[] = [];

  sourceExperience.forEach((item, index) => {
    const entry = normalizeExportExperienceEntry(item, tailored.tailoredExperience[index]?.bullets ?? [], candidateName);
    if (!entry) return;

    const key = [entry.role, entry.company, entry.duration, entry.location]
      .map((value) => normalizeKeyword(value))
      .join("|");

    if (seen.has(key)) return;
    seen.add(key);
    output.push(entry);
  });

  return output;
}

function looksLikeRenderableCertificate(value: string) {
  const text = normalizeWhitespace(value);
  if (!text || /^(certificates?|certifications?|licenses?)$/i.test(text)) return false;

  return /\b(certified|certification|certificate|licensed|license|aws certified|aws solutions architect|microsoft certified|azure fundamentals|google cloud certified|professional cloud|oracle certified|ccna|cisco|comptia|security\+|network\+|pmp|cissp|cisa|ceh|cka|ckad|itil|scrum master|scrummaster|salesforce certified|databricks|snowpro)\b/i.test(text);
}

function buildContactLine(contact: ParsedResume["contact"]) {
  return compactJoin(
    [
      contact?.email,
      contact?.phone,
      contact?.linkedin,
      contact?.location
    ],
    " · "
  );
}

function buildLinksLine(contact: ParsedResume["contact"]) {
  return compactJoin(
    [
      contact?.github,
      contact?.website
    ],
    " · "
  );
}

export function buildResumeExportModel(input: {
  source: ParsedResume;
  tailored: TailoredResume;
}): ResumeExportModel {
  const source = input.source;
  const tailored = input.tailored;
  const tailoredSkills = dedupeStrings(
    tailored.tailoredSkills.map((skill) => normalizeWhitespace(skill))
  );
  const prioritizedSkills = dedupeStrings(tailoredSkills.map((skill) => normalizeWhitespace(skill)));
  const classifiedCategories = groupSkillsByClassification(tailoredSkills);
  const skillCategories = buildSkillCategories(classifiedCategories, prioritizedSkills);
  const candidateName = normalizeWhitespace(source.name) || "Candidate";
  const experience = normalizeExportExperience(source.experience, tailored, candidateName);

  // Align the most recent role title with the target job title (stored in source.title
  // by candidateProfileToParsedResume) so the resume reads as built for this specific role.
  const targetTitle = normalizeWhitespace(source.title);
  if (experience.length > 0 && targetTitle) {
    experience[0] = { ...experience[0], role: targetTitle };
  }

  return {
    name: candidateName,
    title: targetTitle,
    contactLine: buildContactLine({
      ...source.contact,
      location: cleanContactLocation(source.contact?.location || "")
    }),
    linksLine: buildLinksLine(source.contact),
    summary: normalizeWhitespace(tailored.summary),
    skillCategories,
    skills: skillCategories.length > 0 ? skillCategories.flatMap((category) => category.skills) : prioritizedSkills,
    experience,
    education: source.education.map((item) => ({
      school: normalizeWhitespace(item.school),
      degree: normalizeWhitespace(item.degree),
      duration: normalizeWhitespace(item.duration),
      location: normalizeWhitespace(item.location),
      details: normalizeLines(item.details)
    })),
    certificates: normalizeLines(source.certificates).filter(looksLikeRenderableCertificate)
  };
}

export function buildResumeExportModelFromMarkdown(markdown: string, fallbackName = ""): ResumeExportModel {
  const parsed = normalizeParsedResume(
    parseResumeText({
      text: markdown,
      candidateName: fallbackName
    }),
    fallbackName
  );

  return buildResumeExportModel({
    source: parsed,
    tailored: buildFallbackTailoredResume(parsed, parsed.title, "")
  });
}

export async function buildResumePdfBuffer(input: {
  source: ParsedResume;
  tailored: TailoredResume;
}) {
  const model = buildResumeExportModel(input);
  const buffer = await renderToBuffer(createElement(ResumePdfDocument, { model }) as any);
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

function createDocxParagraph(
  text: string,
  options: { bold?: boolean; italics?: boolean; size?: number; spacingAfter?: number; bullet?: boolean; font?: string } = {}
) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: options.bold,
        italics: options.italics,
        size: options.size ?? 22,
        font: options.font ?? "Times New Roman"
      })
    ],
    spacing: {
      after: options.spacingAfter ?? 120,
      line: 280
    },
    bullet: options.bullet ? { level: 0 } : undefined
  });
}

export async function buildResumeDocxBuffer(input: {
  source: ParsedResume;
  tailored: TailoredResume;
}) {
  const model = buildResumeExportModel(input);
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: model.name, bold: true, size: ATS_CLASSIC_TEMPLATE.typography.nameSize * 2, font: "Times New Roman", color: "666666" })],
      spacing: { after: ATS_CLASSIC_TEMPLATE.layout.paragraphGap * 10 }
    })
  );

  if (model.title) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: model.title, bold: true, size: ATS_CLASSIC_TEMPLATE.typography.titleSize * 2, font: "Times New Roman", color: "111111" })],
        spacing: { after: ATS_CLASSIC_TEMPLATE.layout.paragraphGap * 12 }
      })
    );
  }

  if (model.contactLine) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: model.contactLine, size: 18, font: "Times New Roman" })],
        spacing: { after: ATS_CLASSIC_TEMPLATE.layout.paragraphGap * 10 }
      })
    );
  }

  if (model.linksLine) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: model.linksLine, size: 16, font: "Times New Roman" })],
        spacing: { after: ATS_CLASSIC_TEMPLATE.layout.paragraphGap * 10 }
      })
    );
  }

  children.push(createDocxParagraph("Professional Summary", { bold: true, size: ATS_CLASSIC_TEMPLATE.typography.sectionHeadingSize * 2, spacingAfter: 60 }));
  if (model.summary) {
    children.push(createDocxParagraph(model.summary, { size: ATS_CLASSIC_TEMPLATE.typography.bodySize * 2, spacingAfter: 120 }));
  }

  children.push(createDocxParagraph("Work Experience", { bold: true, size: ATS_CLASSIC_TEMPLATE.typography.sectionHeadingSize * 2, spacingAfter: 60 }));
  for (const item of model.experience) {
    const header = compactJoin([item.role, item.duration].filter(Boolean), ATS_CLASSIC_TEMPLATE.separators.entry);
    if (header) {
      children.push(createDocxParagraph(header, { bold: true, size: ATS_CLASSIC_TEMPLATE.typography.bodySize * 2, spacingAfter: 40 }));
    }

    const companyLine = compactJoin([item.company, item.location].filter(Boolean), ATS_CLASSIC_TEMPLATE.separators.entry);
    if (companyLine) {
      children.push(createDocxParagraph(companyLine, { italics: true, size: ATS_CLASSIC_TEMPLATE.typography.subtextSize * 2, spacingAfter: 60 }));
    }

    for (const bullet of item.bullets) {
      children.push(createDocxParagraph(bullet, { size: ATS_CLASSIC_TEMPLATE.typography.bodySize * 2, bullet: true, spacingAfter: 40 }));
    }

    children.push(createDocxParagraph("", { size: 4, spacingAfter: 60 }));
  }

  if (model.education.length > 0) {
    children.push(createDocxParagraph("Education", { bold: true, size: ATS_CLASSIC_TEMPLATE.typography.sectionHeadingSize * 2, spacingAfter: 60 }));
    for (const item of model.education) {
      const header = compactJoin([item.school, item.duration].filter(Boolean), ATS_CLASSIC_TEMPLATE.separators.entry);
      if (header) {
        children.push(createDocxParagraph(header, { bold: true, size: ATS_CLASSIC_TEMPLATE.typography.bodySize * 2, spacingAfter: 40 }));
      }

      const degreeLine = compactJoin([item.degree, item.location].filter(Boolean), ATS_CLASSIC_TEMPLATE.separators.entry);
      if (degreeLine) {
        children.push(createDocxParagraph(degreeLine, { italics: true, size: ATS_CLASSIC_TEMPLATE.typography.subtextSize * 2, spacingAfter: 40 }));
      }

      for (const detail of item.details) {
        children.push(createDocxParagraph(detail, { size: ATS_CLASSIC_TEMPLATE.typography.bodySize * 2, bullet: true, spacingAfter: 40 }));
      }

      children.push(createDocxParagraph("", { size: 4, spacingAfter: 60 }));
    }
  }

  if (model.certificates.length > 0) {
    children.push(createDocxParagraph("Certificates", { bold: true, size: ATS_CLASSIC_TEMPLATE.typography.sectionHeadingSize * 2, spacingAfter: 60 }));
    for (const certificate of model.certificates) {
      children.push(createDocxParagraph(certificate, { size: ATS_CLASSIC_TEMPLATE.typography.bodySize * 2, bullet: true, spacingAfter: 40 }));
    }
  }

  children.push(createDocxParagraph("Technical Skills", { bold: true, size: ATS_CLASSIC_TEMPLATE.typography.sectionHeadingSize * 2, spacingAfter: 60 }));
  if (model.skillCategories.length > 0) {
    for (const category of model.skillCategories) {
      const categoryText = category.category || "Skills";
      const skillText = category.skills.join(", ");
      children.push(
        new Paragraph({
          spacing: {
            after: 40,
            line: 280
          },
          children: [
            new TextRun({
              text: `${categoryText}: `,
              bold: true,
              size: ATS_CLASSIC_TEMPLATE.typography.bodySize * 2,
              font: "Times New Roman"
            }),
            new TextRun({
              text: skillText,
              size: ATS_CLASSIC_TEMPLATE.typography.bodySize * 2,
              font: "Times New Roman"
            })
          ]
        })
      );
    }
  } else {
    for (const skill of model.skills) {
      children.push(createDocxParagraph(skill, { size: ATS_CLASSIC_TEMPLATE.typography.bodySize * 2, bullet: true, spacingAfter: 40, font: "Times New Roman" }));
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720
            }
          }
        },
        children
      }
    ]
  });

  return Buffer.from(await Packer.toBuffer(doc));
}





