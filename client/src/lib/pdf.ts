type PdfOptions = {
  title: string;
  content: string;
};

type RenderLine = {
  text: string;
  font: "normal" | "bold";
  fontSize: number;
  indent: number;
  lineHeight: number;
};

type ParsedResumeDocument = {
  name: string;
  intro: string[];
  sections: Array<{
    title: string;
    entries: Array<{ kind: "bullet" | "paragraph"; text: string }>;
  }>;
};

function escapePdfText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function normalizeMarkdown(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/^\s*```(?:markdown|md|text)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function stripInlineMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function wrapByChars(text: string, maxChars: number) {
  const words = stripInlineMarkdown(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function maxCharsForLine(pageWidth: number, margin: number, indent: number, fontSize: number) {
  const usable = Math.max(120, pageWidth - margin * 2 - indent);
  const approxCharWidth = Math.max(4.4, fontSize * 0.52);
  return Math.max(24, Math.floor(usable / approxCharWidth));
}

function renderDocumentLines(document: ParsedResumeDocument) {
  const pageWidth = 595.28;
  const margin = 46;
  const lines: RenderLine[] = [];

  if (document.name) {
    const wrappedName = wrapByChars(document.name, maxCharsForLine(pageWidth, margin, 0, 18));
    for (const wrappedLine of wrappedName) {
      lines.push({
        text: wrappedLine,
        font: "bold",
        fontSize: 18,
        indent: 0,
        lineHeight: 22,
      });
    }
    lines.push({ text: "", font: "normal", fontSize: 10, indent: 0, lineHeight: 12 });
  }

  if (document.intro.length > 0) {
    const introText = document.intro.join(" ");
    const wrappedIntro = wrapByChars(introText, maxCharsForLine(pageWidth, margin, 0, 10));
    for (const wrappedLine of wrappedIntro) {
      lines.push({
        text: wrappedLine,
        font: "normal",
        fontSize: 10,
        indent: 0,
        lineHeight: 14,
      });
    }
    lines.push({ text: "", font: "normal", fontSize: 10, indent: 0, lineHeight: 12 });
  }

  for (const section of document.sections) {
    const wrappedTitle = wrapByChars(section.title.toUpperCase(), maxCharsForLine(pageWidth, margin, 0, 11));
    for (const wrappedLine of wrappedTitle) {
      lines.push({
        text: wrappedLine,
        font: "bold",
        fontSize: 11,
        indent: 0,
        lineHeight: 14,
      });
    }

    lines.push({ text: "", font: "normal", fontSize: 10, indent: 0, lineHeight: 6 });

    for (const entry of section.entries) {
      if (entry.kind === "bullet") {
        const wrappedBullet = wrapByChars(entry.text, maxCharsForLine(pageWidth, margin, 18, 10));
        wrappedBullet.forEach((wrappedLine, index) => {
          lines.push({
            text: index === 0 ? `• ${wrappedLine}` : wrappedLine,
            font: "normal",
            fontSize: 10,
            indent: index === 0 ? 10 : 18,
            lineHeight: 14,
          });
        });
      } else {
        const wrappedParagraph = wrapByChars(entry.text, maxCharsForLine(pageWidth, margin, 0, 10));
        for (const wrappedLine of wrappedParagraph) {
          lines.push({
            text: wrappedLine,
            font: "normal",
            fontSize: 10,
            indent: 0,
            lineHeight: 14,
          });
        }
      }

      lines.push({ text: "", font: "normal", fontSize: 10, indent: 0, lineHeight: 6 });
    }

    lines.push({ text: "", font: "normal", fontSize: 10, indent: 0, lineHeight: 10 });
  }

  return lines;
}

function markdownToRenderLines(markdown: string) {
  const pageWidth = 595.28;
  const margin = 46;
  const lines: RenderLine[] = [];
  const sourceLines = normalizeMarkdown(markdown).split("\n");

  for (const rawLine of sourceLines) {
    const line = rawLine.trim();

    if (!line || /^---+$/.test(line)) {
      lines.push({
        text: "",
        font: "normal",
        fontSize: 10,
        indent: 0,
        lineHeight: 8
      });
      continue;
    }

    if (/^#\s+/.test(line)) {
      const text = stripInlineMarkdown(line.replace(/^#\s+/, ""));
      const wrapped = wrapByChars(text, maxCharsForLine(pageWidth, margin, 0, 18));
      for (const wrappedLine of wrapped) {
        lines.push({
          text: wrappedLine,
          font: "bold",
          fontSize: 18,
          indent: 0,
          lineHeight: 24
        });
      }
      lines.push({ text: "", font: "normal", fontSize: 10, indent: 0, lineHeight: 8 });
      continue;
    }

    if (/^##\s+/.test(line)) {
      const text = stripInlineMarkdown(line.replace(/^##\s+/, ""));
      const wrapped = wrapByChars(text, maxCharsForLine(pageWidth, margin, 0, 12));
      for (const wrappedLine of wrapped) {
        lines.push({
          text: wrappedLine.toUpperCase(),
          font: "bold",
          fontSize: 12,
          indent: 0,
          lineHeight: 17
        });
      }
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const text = stripInlineMarkdown(line.replace(/^[-*]\s+/, ""));
      const wrapped = wrapByChars(text, maxCharsForLine(pageWidth, margin, 18, 10));
      wrapped.forEach((wrappedLine, index) => {
        lines.push({
          text: index === 0 ? `- ${wrappedLine}` : wrappedLine,
          font: "normal",
          fontSize: 10,
          indent: index === 0 ? 10 : 18,
          lineHeight: 14
        });
      });
      continue;
    }

    const wrapped = wrapByChars(line, maxCharsForLine(pageWidth, margin, 0, 10));
    for (const wrappedLine of wrapped) {
      lines.push({
        text: wrappedLine,
        font: "normal",
        fontSize: 10,
        indent: 0,
        lineHeight: 14
      });
    }
  }

  return lines;
}

function paginateLines(lines: RenderLine[], pageHeight: number, margin: number) {
  const pages: RenderLine[][] = [[]];
  const maxContentHeight = pageHeight - margin * 2;
  let currentHeight = 0;

  for (const line of lines) {
    const increment = Math.max(6, line.lineHeight);
    if (currentHeight + increment > maxContentHeight && pages[pages.length - 1].length > 0) {
      pages.push([]);
      currentHeight = 0;
    }

    pages[pages.length - 1].push(line);
    currentHeight += increment;
  }

  if (pages.length === 0) {
    pages.push([]);
  }

  return pages;
}

function parseResumeMarkdown(markdown: string): ParsedResumeDocument {
  const normalized = normalizeMarkdown(markdown);
  const lines = normalized.split("\n");
  const sections: ParsedResumeDocument["sections"] = [];
  let name = "";
  const intro: string[] = [];
  let currentSection: ParsedResumeDocument["sections"][number] | null = null;

  const sectionTitles = [
    "Professional Summary",
    "Summary",
    "Key Skills",
    "Skills",
    "Work Experience",
    "Experience",
    "Education",
  ];

  const ensureSection = (title: string) => {
    if (!currentSection || currentSection.title !== title) {
      currentSection = { title, entries: [] };
      sections.push(currentSection);
    }
    return currentSection;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (/^#\s+/.test(line)) {
      const text = stripInlineMarkdown(line.replace(/^#\s+/, ""));
      if (!name) {
        name = text;
      } else {
        intro.push(text);
      }
      continue;
    }

    const plainSection = sectionTitles.find((title) => new RegExp(`^${title.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}:?$`, "i").test(line));
    if (plainSection) {
      currentSection = ensureSection(plainSection);
      continue;
    }

    if (/^#{2,3}\s+/.test(line)) {
      const title = stripInlineMarkdown(line.replace(/^#{2,3}\s+/, ""));
      currentSection = ensureSection(title);
      continue;
    }

    if (/^[-*\u2022]\s+/.test(line)) {
      const targetSection = currentSection ?? ensureSection("Highlights");
      targetSection.entries.push({ kind: "bullet", text: stripInlineMarkdown(line.replace(/^[-*\u2022]\s+/, "")) });
      continue;
    }

    if (currentSection) {
      currentSection.entries.push({ kind: "paragraph", text: stripInlineMarkdown(line) });
    } else {
      intro.push(stripInlineMarkdown(line));
    }
  }

  return {
    name,
    intro,
    sections,
  };
}

function buildPdfBytes(content: string, _title: string) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 46;
  const parsed = parseResumeMarkdown(content);
  const renderLines = parsed.sections.length > 0 || parsed.name || parsed.intro.length > 0
    ? renderDocumentLines(parsed)
    : markdownToRenderLines(content);
  const pages = paginateLines(renderLines, pageHeight, margin);

  const objects: string[] = [];
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;

  pages.forEach((pageLines, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    let y = pageHeight - margin;
    const commands: string[] = ["BT"];

    for (const line of pageLines) {
      if (!line.text) {
        y -= line.lineHeight;
        continue;
      }

      const fontId = line.font === "bold" ? "F2" : "F1";
      commands.push(`/${fontId} ${line.fontSize} Tf`);
      commands.push(`1 0 0 1 ${margin + line.indent} ${Math.max(24, y)} Tm`);
      commands.push(`(${escapePdfText(line.text)}) Tj`);
      y -= line.lineHeight;
    }

    commands.push("ET");
    const pageContent = commands.join("\n");

    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${new TextEncoder().encode(pageContent).length} >>\nstream\n${pageContent}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = new Array(objects.length).fill(0);

  for (let i = 1; i < objects.length; i += 1) {
    if (!objects[i]) continue;
    offsets[i] = new TextEncoder().encode(pdf).length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < objects.length; i += 1) {
    if (!objects[i]) {
      pdf += "0000000000 00000 f \n";
      continue;
    }
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

export function downloadResumePdf(options: PdfOptions) {
  const blob = buildPdfBytes(options.content, options.title || "Resume");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${options.title || "resume"}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
