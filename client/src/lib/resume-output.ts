type GeneratedResumeShape = {
  preview?: unknown;
  resumeMarkdown?: unknown;
  markdown?: unknown;
  content?: unknown;
  coverLetterMarkdown?: unknown;
  result?: unknown;
};

function parseJsonCandidate(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return parseJsonCandidate(fenced[1]);
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  return null;
}

export function extractResumePreview(input: unknown): string {
  if (typeof input === "string") {
    const parsed = parseJsonCandidate(input);
    if (parsed !== null) {
      return extractResumePreview(parsed);
    }
    return input.trim();
  }

  if (input && typeof input === "object") {
    const record = input as GeneratedResumeShape;
    const fields = [
      record.preview,
      record.resumeMarkdown,
      record.markdown,
      record.content,
      record.coverLetterMarkdown,
      record.result,
    ];

    for (const field of fields) {
      const candidate = extractResumePreview(field);
      if (candidate) {
        return candidate;
      }
    }
  }

  return "";
}

export function replaceResumeHeadingName(markdown: string, candidateName: string) {
  const name = candidateName.trim();
  if (!name) {
    return markdown;
  }

  return markdown.replace(/^#\s+.+$/m, `# ${name}`);
}

