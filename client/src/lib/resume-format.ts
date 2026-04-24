export type ResumeEntry = {
  kind: "bullet" | "paragraph";
  text: string;
};

export type ResumeSection = {
  title: string;
  entries: ResumeEntry[];
};

export type ParsedResumeDocument = {
  name: string;
  intro: string[];
  sections: ResumeSection[];
};

const KNOWN_SECTION_TITLES: Array<{ pattern: RegExp; title: string }> = [
  { pattern: /^professional summary:?$/i, title: "Professional Summary" },
  { pattern: /^summary:?$/i, title: "Summary" },
  { pattern: /^key skills:?$/i, title: "Key Skills" },
  { pattern: /^skills:?$/i, title: "Skills" },
  { pattern: /^work experience:?$/i, title: "Work Experience" },
  { pattern: /^experience:?$/i, title: "Experience" },
  { pattern: /^education:?$/i, title: "Education" }
];

export function stripInlineMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function looksLikeResumeDocument(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  return /(^|\n)#{1,3}\s+/.test(normalized) || /(^|\n)\s*[-*\u2022]\s+/.test(normalized);
}

function detectPlainSectionTitle(line: string) {
  for (const item of KNOWN_SECTION_TITLES) {
    if (item.pattern.test(line.trim())) {
      return item.title;
    }
  }

  return null;
}

export function parseResumeMarkdown(markdown: string): ParsedResumeDocument {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let name = "";
  const intro: string[] = [];
  const sections: ResumeSection[] = [];
  let currentSection: ResumeSection | null = null;
  let paragraphBuffer: string[] = [];

  function flushParagraph() {
    const text = stripInlineMarkdown(paragraphBuffer.join(" ").trim());
    if (!text) {
      paragraphBuffer = [];
      return;
    }

    if (currentSection) {
      currentSection.entries.push({ kind: "paragraph", text });
    } else {
      intro.push(text);
    }

    paragraphBuffer = [];
  }

  function ensureSection(title: string) {
    if (!currentSection || currentSection.title !== title) {
      currentSection = { title, entries: [] };
      sections.push(currentSection);
    }

    return currentSection;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushParagraph();
      continue;
    }

    if (/^#{2,3}\s+/.test(trimmed)) {
      flushParagraph();
      currentSection = { title: stripInlineMarkdown(trimmed.replace(/^#{2,3}\s+/, "")), entries: [] };
      sections.push(currentSection);
      continue;
    }

    if (/^#\s+/.test(trimmed)) {
      flushParagraph();
      const text = stripInlineMarkdown(trimmed.replace(/^#\s+/, ""));
      if (!name) {
        name = text;
      } else {
        intro.push(text);
      }
      continue;
    }

    const plainSectionTitle = detectPlainSectionTitle(trimmed);
    if (plainSectionTitle) {
      flushParagraph();
      ensureSection(plainSectionTitle);
      continue;
    }

    if (/^[-*\u2022]\s+/.test(trimmed)) {
      flushParagraph();
      const targetSection = currentSection ?? ensureSection("Highlights");
      targetSection.entries.push({
        kind: "bullet",
        text: stripInlineMarkdown(trimmed.replace(/^[-*\u2022]\s+/, ""))
      });
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph();

  return {
    name,
    intro,
    sections: sections.filter((section) => section.entries.length > 0 || section.title.length > 0)
  };
}

export function resumeMarkdownToPlainText(markdown: string) {
  const doc = parseResumeMarkdown(markdown);
  const lines: string[] = [];

  if (doc.name) {
    lines.push(doc.name);
  }

  if (doc.intro.length > 0) {
    lines.push(doc.intro.join(" "));
    lines.push("");
  }

  for (const section of doc.sections) {
    lines.push(section.title.toUpperCase());
    for (const entry of section.entries) {
      if (entry.kind === "bullet") {
        lines.push(`- ${entry.text}`);
      } else {
        lines.push(entry.text);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
