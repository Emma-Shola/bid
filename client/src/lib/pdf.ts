type PdfOptions = {
  title: string;
  content: string;
  structured?: import("@/lib/resume-preview").GeneratedResumeStructured | null;
};

type RenderLine = {
  text: string;
  font: "normal" | "bold";
  fontSize: number;
  indent: number;
  lineHeight: number;
};

import { parseResumeMarkdown, type ParsedResumeDocument } from "@/lib/resume-format";
import { RESUME_RENDER_TOKENS } from "@/resume-rendering";

const PDF_MARGIN = RESUME_RENDER_TOKENS.layout.margin;
const PDF_PAGE_WIDTH = RESUME_RENDER_TOKENS.layout.pageWidth;
const PDF_PAGE_HEIGHT = RESUME_RENDER_TOKENS.layout.pageHeight;
const PDF_TYPOGRAPHY = RESUME_RENDER_TOKENS.typography;
const PDF_LINE_GAP = Math.max(5, Math.round(PDF_TYPOGRAPHY.bodySize * 0.8));
const PDF_SECTION_GAP = Math.max(6, Math.round(PDF_TYPOGRAPHY.bodySize * 0.95));

function looksLikeResumeInstructionText(value: string) {
  const text = (value ?? "").replace(/\r\n/g, "\n");
  return /above is job description and following is current resume/i.test(text)
    || /resume tailoring instruction/i.test(text)
    || /instructions for resume generation/i.test(text)
    || /build one clean json-ready resume instruction file/i.test(text)
    || /clean the text first/i.test(text)
    || /remove broken characters/i.test(text)
    || /preserve all real content/i.test(text)
    || /headline:\s*create a strong/i.test(text)
    || /summary:\s*-/i.test(text)
    || /work experience:\s*-/i.test(text)
    || /skills:\s*-/i.test(text)
    || /education:\s*-/i.test(text)
    || /certificates:\s*-/i.test(text)
    || /general:\s*-/i.test(text)
    || /use \[\] if none are found/i.test(text)
    || /do not invent certifications/i.test(text)
    || /place the skills section after experience/i.test(text)
    || /keep the output utf-8 clean/i.test(text)
    || /downloaded file must use the name/i.test(text)
    || /every sentence must be 25\+ words/i.test(text)
    || /return strict json only/i.test(text);
}

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

function normalizePrintableText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function joinInline(values: Array<string | null | undefined>, separator = " | ") {
  return values
    .map((value) => normalizePrintableText(value))
    .filter(Boolean)
    .join(separator)
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

function serializeStructuredResume(structured: import("@/lib/resume-preview").GeneratedResumeStructured) {
  const lines: string[] = [];
  const source = structured.source;
  const tailored = structured.tailored;
  const summary = normalizePrintableText(tailored.summary);
  const prioritizedSkills = Array.from(
    new Set(tailored.tailoredSkills.map((skill) => normalizePrintableText(skill)).filter(Boolean))
  );

  lines.push(`# ${normalizePrintableText(source.name) || "Resume"}`);

  if (source.title) {
    lines.push(`**${normalizePrintableText(source.title)}**`);
  }

  const contactLine = joinInline([
    source.contact?.email,
    source.contact?.phone,
    source.contact?.location,
  ]);
  if (contactLine) {
    lines.push(contactLine);
  }

  const linksLine = joinInline([
    source.contact?.linkedin,
    source.contact?.github,
    source.contact?.website,
  ]);
  if (linksLine) {
    lines.push(linksLine);
  }

  lines.push("");

  if (summary) {
    lines.push("## Professional Summary");
    lines.push(summary);
    lines.push("");
  }

  if (source.experience.length > 0) {
    lines.push("## Work Experience");
    source.experience.forEach((item, index) => {
      const tailoredBullets = tailored.tailoredExperience[index]?.bullets ?? [];
      const bullets = tailoredBullets;

      const roleLine = joinInline([item.role, item.duration], " - ");
      if (roleLine) {
        lines.push(roleLine);
      }

      const companyLine = joinInline([item.company, item.location], " - ");
      if (companyLine) {
        lines.push(companyLine);
      }

      for (const bullet of bullets) {
        const cleaned = normalizePrintableText(bullet);
        if (cleaned) {
          lines.push(`- ${cleaned}`);
        }
      }

      lines.push("");
    });
  }

  if (source.education.length > 0) {
    lines.push("## Education");
    source.education.forEach((item) => {
      const degreeLine = joinInline([item.degree, item.duration], " - ");
      if (degreeLine) {
        lines.push(degreeLine);
      }

      const schoolLine = joinInline([item.school, item.location], " - ");
      if (schoolLine) {
        lines.push(schoolLine);
      }

      for (const detail of item.details) {
        const cleaned = normalizePrintableText(detail);
        if (cleaned) {
          lines.push(`- ${cleaned}`);
        }
      }

      lines.push("");
    });
  }

  if (source.certificates.length > 0) {
    lines.push("## Certificates");
    for (const certificate of source.certificates) {
      const cleaned = normalizePrintableText(certificate);
      if (cleaned) {
        lines.push(`- ${cleaned}`);
      }
    }
    lines.push("");
  }

  lines.push("## Technical Skills");
  if (prioritizedSkills.length > 0) {
    lines.push(`Core Technical Skills: ${prioritizedSkills.join(", ")}`);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
  const approxCharWidth = Math.max(4.1, fontSize * 0.48);
  return Math.max(24, Math.floor(usable / approxCharWidth));
}

function renderDocumentLines(document: ParsedResumeDocument) {
  const pageWidth = PDF_PAGE_WIDTH;
  const margin = PDF_MARGIN;
  const lines: RenderLine[] = [];

  if (document.name) {
    const wrappedName = wrapByChars(document.name, maxCharsForLine(pageWidth, margin, 0, PDF_TYPOGRAPHY.nameSize));
    for (const wrappedLine of wrappedName) {
      lines.push({
        text: wrappedLine,
        font: "bold",
        fontSize: PDF_TYPOGRAPHY.nameSize,
        indent: 0,
        lineHeight: Math.round(PDF_TYPOGRAPHY.nameSize * 1.15),
      });
    }
    lines.push({ text: "", font: "normal", fontSize: PDF_TYPOGRAPHY.bodySize, indent: 0, lineHeight: PDF_SECTION_GAP });
  }

  if (document.intro.length > 0) {
    const introText = document.intro.join(" ");
    const wrappedIntro = wrapByChars(introText, maxCharsForLine(pageWidth, margin, 0, PDF_TYPOGRAPHY.bodySize));
    for (const wrappedLine of wrappedIntro) {
      lines.push({
        text: wrappedLine,
        font: "normal",
        fontSize: PDF_TYPOGRAPHY.bodySize,
        indent: 0,
        lineHeight: Math.round(PDF_TYPOGRAPHY.bodySize * 1.35),
      });
    }
    lines.push({ text: "", font: "normal", fontSize: PDF_TYPOGRAPHY.bodySize, indent: 0, lineHeight: PDF_LINE_GAP });
  }

  for (const section of document.sections) {
    const wrappedTitle = wrapByChars(section.title.toUpperCase(), maxCharsForLine(pageWidth, margin, 0, PDF_TYPOGRAPHY.sectionHeadingSize));
    for (const wrappedLine of wrappedTitle) {
      lines.push({
        text: wrappedLine,
        font: "bold",
        fontSize: PDF_TYPOGRAPHY.sectionHeadingSize,
        indent: 0,
        lineHeight: Math.round(PDF_TYPOGRAPHY.sectionHeadingSize * 1.4),
      });
    }

    lines.push({ text: "", font: "normal", fontSize: PDF_TYPOGRAPHY.bodySize, indent: 0, lineHeight: PDF_LINE_GAP });

    for (const entry of section.entries) {
      if (entry.kind === "bullet") {
        const wrappedBullet = wrapByChars(entry.text, maxCharsForLine(pageWidth, margin, 18, PDF_TYPOGRAPHY.bodySize));
        wrappedBullet.forEach((wrappedLine, index) => {
          lines.push({
            text: index === 0 ? `- ${wrappedLine}` : wrappedLine,
            font: "normal",
            fontSize: PDF_TYPOGRAPHY.bodySize,
            indent: index === 0 ? 10 : 18,
            lineHeight: Math.round(PDF_TYPOGRAPHY.bodySize * 1.35),
          });
        });
      } else {
        const wrappedParagraph = wrapByChars(entry.text, maxCharsForLine(pageWidth, margin, 0, PDF_TYPOGRAPHY.bodySize));
        for (const wrappedLine of wrappedParagraph) {
          lines.push({
            text: wrappedLine,
            font: "normal",
            fontSize: PDF_TYPOGRAPHY.bodySize,
            indent: 0,
            lineHeight: Math.round(PDF_TYPOGRAPHY.bodySize * 1.35),
          });
        }
      }

      lines.push({ text: "", font: "normal", fontSize: PDF_TYPOGRAPHY.bodySize, indent: 0, lineHeight: PDF_LINE_GAP });
    }

    lines.push({ text: "", font: "normal", fontSize: PDF_TYPOGRAPHY.bodySize, indent: 0, lineHeight: PDF_SECTION_GAP });
  }

  return lines;
}

function markdownToRenderLines(markdown: string) {
  const pageWidth = PDF_PAGE_WIDTH;
  const margin = PDF_MARGIN;
  const lines: RenderLine[] = [];
  const sourceLines = normalizeMarkdown(markdown).split("\n");

  for (const rawLine of sourceLines) {
    const line = rawLine.trim();

    if (!line || /^---+$/.test(line)) {
      lines.push({
        text: "",
        font: "normal",
        fontSize: PDF_TYPOGRAPHY.bodySize,
        indent: 0,
        lineHeight: PDF_SECTION_GAP
      });
      continue;
    }

    if (/^#\s+/.test(line)) {
      const text = stripInlineMarkdown(line.replace(/^#\s+/, ""));
      const wrapped = wrapByChars(text, maxCharsForLine(pageWidth, margin, 0, PDF_TYPOGRAPHY.nameSize));
      for (const wrappedLine of wrapped) {
        lines.push({
          text: wrappedLine,
          font: "bold",
          fontSize: PDF_TYPOGRAPHY.nameSize,
          indent: 0,
          lineHeight: Math.round(PDF_TYPOGRAPHY.nameSize * 1.15)
        });
      }
      lines.push({ text: "", font: "normal", fontSize: PDF_TYPOGRAPHY.bodySize, indent: 0, lineHeight: PDF_SECTION_GAP });
      continue;
    }

    if (/^##\s+/.test(line)) {
      const text = stripInlineMarkdown(line.replace(/^##\s+/, ""));
      const wrapped = wrapByChars(text, maxCharsForLine(pageWidth, margin, 0, PDF_TYPOGRAPHY.sectionHeadingSize));
      for (const wrappedLine of wrapped) {
        lines.push({
          text: wrappedLine.toUpperCase(),
          font: "bold",
          fontSize: PDF_TYPOGRAPHY.sectionHeadingSize,
          indent: 0,
          lineHeight: Math.round(PDF_TYPOGRAPHY.sectionHeadingSize * 1.4)
        });
      }
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const text = stripInlineMarkdown(line.replace(/^[-*]\s+/, ""));
      const wrapped = wrapByChars(text, maxCharsForLine(pageWidth, margin, 18, PDF_TYPOGRAPHY.bodySize));
      wrapped.forEach((wrappedLine, index) => {
        lines.push({
          text: index === 0 ? `- ${wrappedLine}` : wrappedLine,
          font: "normal",
          fontSize: PDF_TYPOGRAPHY.bodySize,
          indent: index === 0 ? 10 : 18,
          lineHeight: Math.round(PDF_TYPOGRAPHY.bodySize * 1.35)
        });
      });
      continue;
    }

    const wrapped = wrapByChars(line, maxCharsForLine(pageWidth, margin, 0, PDF_TYPOGRAPHY.bodySize));
    for (const wrappedLine of wrapped) {
      lines.push({
        text: wrappedLine,
        font: "normal",
        fontSize: PDF_TYPOGRAPHY.bodySize,
        indent: 0,
        lineHeight: Math.round(PDF_TYPOGRAPHY.bodySize * 1.35)
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

// use canonical `parseResumeMarkdown` from resume-format.ts

function buildPdfBytes(
  content: string,
  _title: string,
  structured?: import("@/lib/resume-preview").GeneratedResumeStructured | null
) {
  const printableContent = structured ? serializeStructuredResume(structured) : content;

  if (looksLikeResumeInstructionText(printableContent)) {
    throw new Error("Instruction-only TXT files cannot be rendered as resumes. Upload the original resume instead.");
  }

  const pageWidth = PDF_PAGE_WIDTH;
  const pageHeight = PDF_PAGE_HEIGHT;
  const margin = PDF_MARGIN;
  const parsed = parseResumeMarkdown(printableContent);
  const renderLines = parsed.sections.length > 0 || parsed.name || parsed.intro.length > 0
    ? renderDocumentLines(parsed)
    : markdownToRenderLines(printableContent);
  const pages = paginateLines(renderLines, pageHeight, margin);

  const objects: string[] = [];
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>`;

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
  const blob = buildPdfBytes(options.content, options.title || "Resume", options.structured ?? null);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${options.title || "resume"}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}


