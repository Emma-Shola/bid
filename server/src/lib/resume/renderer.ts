import { compactJoin, normalizeWhitespace } from "./shared";
import { type ParsedResume, type ResumeSkillCategory, type TailoredResume } from "./types";
import { ATS_CLASSIC_TEMPLATE } from "./template-engine";

function renderContactLine(contact: ParsedResume["contact"]) {
  const parts = [
    contact?.email,
    contact?.phone,
    contact?.location,
  ]
    .map((part) => normalizeWhitespace(part || ""))
    .filter(Boolean);

  return parts.join(" | ");
}

function renderLinksLine(contact: ParsedResume["contact"]) {
  const parts = [
    contact?.linkedin,
    contact?.github,
    contact?.website
  ]
    .map((part) => normalizeWhitespace(part || ""))
    .filter(Boolean);

  return parts.join(" | ");
}

function renderSkillCategories(
  categories: ResumeSkillCategory[],
  prioritizedSkills: string[],
  coreSkills: string[] = []
) {
  const priorityIndex = new Map(
    prioritizedSkills.map((skill, index) => [normalizeWhitespace(skill).toLowerCase(), index])
  );

  const used = new Set<string>();
  const rendered: string[] = [];
  const coreList = coreSkills.map((skill) => normalizeWhitespace(skill)).filter(Boolean);

  if (coreList.length > 0) {
    rendered.push(`- **Core Technical Skills**: ${coreList.join(", ")}`);
    coreList.forEach((skill) => used.add(skill.toLowerCase()));
  }

  for (const category of categories) {
    const orderedSkills = category.skills
      .map((skill) => normalizeWhitespace(skill))
      .filter(Boolean)
      .filter((skill) => !used.has(skill.toLowerCase()))
      .sort((left, right) => {
        const leftIndex = priorityIndex.has(left.toLowerCase()) ? (priorityIndex.get(left.toLowerCase()) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        const rightIndex = priorityIndex.has(right.toLowerCase()) ? (priorityIndex.get(right.toLowerCase()) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
      });

    if (!orderedSkills.length) {
      continue;
    }

    rendered.push(`- **${normalizeWhitespace(category.category) || "Skills"}**: ${orderedSkills.join(", ")}`);
    orderedSkills.forEach((skill) => used.add(skill.toLowerCase()));
  }

  const extraSkills = prioritizedSkills
    .map((skill) => normalizeWhitespace(skill))
    .filter(Boolean)
    .filter((skill) => !used.has(skill.toLowerCase()));

  if (extraSkills.length > 0) {
    rendered.push(`- **Additional Relevant Skills**: ${extraSkills.join(", ")}`);
  }

  return rendered;
}

export function renderResumeMarkdown(input: {
  source: ParsedResume;
  tailored: TailoredResume;
}) {
  const lines: string[] = [];
  const source = input.source;
  const tailored = input.tailored;
  const tailoredSkills = Array.from(
    new Set(tailored.tailoredSkills.map((skill) => normalizeWhitespace(skill)).filter(Boolean))
  );

  lines.push(`# ${source.name || "Candidate"}`);

  if (source.title) {
    lines.push(`**${source.title}**`);
  }

  const contactLine = renderContactLine(source.contact);
  if (contactLine) {
    lines.push(contactLine);
  }

  const linksLine = renderLinksLine(source.contact);
  if (linksLine) {
    lines.push(linksLine);
  }

  lines.push("");
  lines.push("## Professional Summary");
  lines.push(normalizeWhitespace(tailored.summary));

  lines.push("");
  lines.push("## Work Experience");
  source.experience.forEach((sourceItem, index) => {
    const tailoredItem = tailored.tailoredExperience[index];
    const bullets = (tailoredItem?.bullets ?? []).map((bullet) => normalizeWhitespace(bullet)).filter(Boolean);

    lines.push(`### ${compactJoin([sourceItem.role, sourceItem.duration].filter(Boolean), ATS_CLASSIC_TEMPLATE.separators.entry)}`);

    if (sourceItem.company || sourceItem.location) {
      lines.push(compactJoin([sourceItem.company, sourceItem.location].filter(Boolean), ATS_CLASSIC_TEMPLATE.separators.entry));
    }

    for (const bullet of bullets) {
      const cleaned = normalizeWhitespace(bullet);
      if (cleaned) {
        lines.push(`- ${cleaned}`);
      }
    }

    lines.push("");
  });

  if (source.education.length > 0) {
    lines.push("## Education");
    for (const item of source.education) {
      lines.push(`### ${compactJoin([item.degree, item.duration].filter(Boolean), ATS_CLASSIC_TEMPLATE.separators.entry)}`);
      if (item.degree || item.location) {
        lines.push(compactJoin([item.school, item.location].filter(Boolean), ATS_CLASSIC_TEMPLATE.separators.entry));
      }
      for (const detail of item.details) {
        lines.push(`- ${normalizeWhitespace(detail)}`);
      }
      lines.push("");
    }
  }

  if (source.certificates.length > 0) {
    lines.push("## Certificates");
    for (const certificate of source.certificates) {
      lines.push(`- ${normalizeWhitespace(certificate)}`);
    }
  }

  lines.push("");
  lines.push("## Technical Skills");
  const renderedSkills = Array.from(
    new Set(tailoredSkills.map((skill) => normalizeWhitespace(skill)).filter(Boolean))
  );
  for (const skill of renderedSkills) {
    lines.push(`- ${normalizeWhitespace(skill)}`);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function renderResumePlainText(input: {
  source: ParsedResume;
  tailored: TailoredResume;
}) {
  return renderResumeMarkdown(input)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/_{1,2}(.*?)_{1,2}/g, "$1")
    .trim();
}



