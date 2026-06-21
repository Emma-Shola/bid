function parseJsonCandidate(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

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

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isStructuredResumeObject(record: Record<string, unknown>) {
  return Boolean(record.experience || record.skills || record.education || record.certificates || record.summary);
}

function extractWrappedResumeText(value: unknown, depth = 0): string {
  if (depth > 4) {
    return "";
  }

  if (typeof value === "string") {
    const parsed = parseJsonCandidate(value);
    if (parsed !== null) {
      return extractWrappedResumeText(parsed, depth + 1);
    }

    return value.trim();
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const record = value as Record<string, unknown>;

  if (isStructuredResumeObject(record)) {
    return "";
  }

  const priorityFields = [
    record.resumeMarkdown,
    record.markdown,
    record.content,
    record.preview,
    record.resumeText,
    record.text,
    record.output,
    record.result,
    record.data
  ];

  for (const field of priorityFields) {
    const extracted = extractWrappedResumeText(field, depth + 1);
    if (extracted) {
      return extracted;
    }
  }

  return "";
}

export function unwrapResumeContainerText(input: string) {
  return extractWrappedResumeText(input) || input.trim();
}

