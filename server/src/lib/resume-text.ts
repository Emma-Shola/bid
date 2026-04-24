import path from "node:path";
import { extractTextWithOpenAIOCR } from "./openai-ocr";

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function extractPdfText(buffer: Buffer) {
  try {
    const pdfParseModule = await import("pdf-parse");
    const PDFParseClass = (pdfParseModule as { PDFParse?: new (input: { data: Buffer }) => {
      getText: () => Promise<{ text?: string }>;
      destroy?: () => Promise<void>;
    } }).PDFParse;

    if (PDFParseClass) {
      const parser = new PDFParseClass({ data: buffer });
      try {
        const textResult = await parser.getText();
        return textResult.text ?? "";
      } finally {
        await parser.destroy?.().catch(() => undefined);
      }
    }

    const legacyParser = (pdfParseModule as { default?: (input: Buffer) => Promise<{ text?: string }> }).default;
    if (typeof legacyParser === "function") {
      const data = await legacyParser(buffer);
      return data.text ?? "";
    }

    return "";
  } catch (error) {
    console.error("[Resume Text] PDF extraction error:", error instanceof Error ? error.message : String(error));
    return "";
  }
}

async function extractDocxText(buffer: Buffer) {
  const mammothModule = await import("mammoth");
  const extractRawText =
    (mammothModule as { extractRawText?: (input: { buffer: Buffer }) => Promise<{ value?: string }> }).extractRawText ??
    (mammothModule as { default?: { extractRawText?: (input: { buffer: Buffer }) => Promise<{ value?: string }> } }).default?.extractRawText;

  if (!extractRawText) {
    return "";
  }

  const result = await extractRawText({ buffer });
  return result.value ?? "";
}

export async function extractResumeText(input: {
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
}) {
  const buffer = Buffer.from(input.bytes);
  const extension = path.extname(input.fileName).toLowerCase();
  const mimeType = input.mimeType.toLowerCase();
  const minReliableTextLength = 120;

  const withOcrFallback = async (text: string) => {
    const normalized = normalizeText(text);
    if (normalized.length >= minReliableTextLength) {
      return normalized;
    }

    const ocrText = await extractTextWithOpenAIOCR({
      bytes: input.bytes,
      mimeType: mimeType || "application/octet-stream",
      fileName: input.fileName
    });

    return normalizeText(ocrText || normalized);
  };

  try {
    if (mimeType.includes("text/plain") || extension === ".txt") {
      return {
        text: normalizeText(buffer.toString("utf8")),
        source: "text/plain" as const
      };
    }

    if (mimeType.includes("pdf") || extension === ".pdf") {
      return {
        text: await withOcrFallback(await extractPdfText(buffer)),
        source: "application/pdf" as const
      };
    }

    if (mimeType.includes("wordprocessingml.document") || extension === ".docx") {
      return {
        text: await withOcrFallback(await extractDocxText(buffer)),
        source: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const
      };
    }

    if (
      mimeType.startsWith("image/") ||
      extension === ".png" ||
      extension === ".jpg" ||
      extension === ".jpeg" ||
      extension === ".webp"
    ) {
      return {
        text: await withOcrFallback(""),
        source: mimeType || "image/*"
      };
    }
  } catch (error) {
    console.warn("resume text extraction failed", error);
  }

  return {
    text: "",
    source: mimeType
  };
}
