export function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function compactJoin(values: Array<string | null | undefined>, separator = " | ") {
  return values
    .map((value) => (value ?? "").trim())
    .filter(Boolean)
    .join(separator)
    .trim();
}

export function normalizeKeyword(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    const key = normalizeKeyword(trimmed);
    if (seen.has(key)) continue;

    seen.add(key);
    unique.push(trimmed);
  }

  return unique;
}

export function isBulletLine(line: string) {
  return /^(\s*[-*•]\s+|\s*\d+[.)]\s+)/.test(line);
}

export function stripBulletMarker(line: string) {
  return line
    .replace(/^(\s*[-*•]\s+|\s*\d+[.)]\s+)/, "")
    .trim();
}

export function splitBlocks(lines: string[]) {
  const blocks: string[][] = [];
  let current: string[] = [];

  const flush = () => {
    const cleaned = current.map((line) => line.trim()).filter(Boolean);
    if (cleaned.length > 0) {
      blocks.push(cleaned);
    }
    current = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }

    current.push(line);
  }

  flush();
  return blocks;
}

export function isLikelyDateText(value: string) {
  return /(\b(?:19|20)\d{2}\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|present|current|today|to)/i.test(
    value
  );
}

export function isSectionHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;

  const heading = trimmed.replace(/^#{1,6}\s+/, "").replace(/:$/, "");

  return /^(professional summary|summary|profile|objective|about|experience|work experience|professional experience|employment history|work history|skills|key skills|technical skills|core competencies|education|academics|certifications|certificates|licenses|projects)$/i.test(
    heading
  ) || /^[A-Z][A-Z0-9\s/&(),.-]{2,}:?$/.test(trimmed);
}



