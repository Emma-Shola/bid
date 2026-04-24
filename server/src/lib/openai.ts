import OpenAI from "openai";
import { extractCandidateNameFromResumeText } from "./resume-source";

let client: OpenAI | null = null;

type ResumeEntry =
  | { type: "blank"; raw: string }
  | { type: "text"; raw: string }
  | {
      type: "bullet";
      raw: string;
      prefix: string;
      text: string;
    };

type StructuredResumeSection = {
  name: string;
  headingRaw?: string;
  entries: ResumeEntry[];
};

type StructuredResume = {
  sections: StructuredResumeSection[];
};

type ResumeSectionSnapshot = {
  itemBulletLengths: number[][];
};

type ValidationResult = {
  ok: boolean;
  reason?: string;
};

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  client ??= new OpenAI({ apiKey });
  return client;
}

function unwrapModelText(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return "";

  const fenced = trimmed.match(/^```(?:markdown|md|text)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  return trimmed;
}

function isLikelySectionHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;

  if (/^#{1,6}\s+/.test(trimmed)) {
    return true;
  }

  const withoutColon = trimmed.replace(/:$/, "");

  if (
    /^(professional summary|summary|profile|objective|experience|work experience|professional experience|employment history|education|skills|technical skills|projects|certifications|awards|volunteer experience|interests)$/i.test(
      withoutColon
    )
  ) {
    return true;
  }

  if (/^[A-Z][A-Z\s/&(),.-]{2,}:?$/.test(trimmed) && trimmed.length <= 80) {
    return true;
  }

  return false;
}

function parseStructuredResume(resume: string): StructuredResume {
  const lines = resume.replace(/\r\n/g, "\n").split("\n");
  const sections: StructuredResumeSection[] = [
    {
      name: "General",
      entries: [],
    },
  ];

  let currentSection = sections[0];

  for (const line of lines) {
    const trimmed = line.trim();

    if (isLikelySectionHeading(line)) {
      const sectionName =
        trimmed
          .replace(/^#{1,6}\s+/, "")
          .replace(/:$/, "")
          .trim() || "Section";
      currentSection = {
        name: sectionName,
        headingRaw: line,
        entries: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (!trimmed) {
      currentSection.entries.push({ type: "blank", raw: line });
      continue;
    }

    const bulletMatch = line.match(/^(\s*[-*•]\s+)(.+?)\s*$/);
    if (bulletMatch) {
      currentSection.entries.push({
        type: "bullet",
        raw: line,
        prefix: bulletMatch[1],
        text: bulletMatch[2],
      });
      continue;
    }

    currentSection.entries.push({ type: "text", raw: line });
  }

  return {
    sections: sections.filter((section) => section.entries.length > 0 || section.headingRaw),
  };
}

function snapshotStructure(structured: StructuredResume): ResumeSectionSnapshot[] {
  return structured.sections.map((section) => {
    const itemBulletLengths: number[][] = [];
    let currentItemBullets: number[] = [];

    const flushItem = () => {
      if (currentItemBullets.length > 0) {
        itemBulletLengths.push(currentItemBullets);
        currentItemBullets = [];
      }
    };

    for (const entry of section.entries) {
      if (entry.type === "blank") {
        flushItem();
        continue;
      }

      if (entry.type === "bullet") {
        currentItemBullets.push(entry.text.trim().length);
      }
    }

    flushItem();

    return { itemBulletLengths };
  });
}

function buildStrictRewritePrompt(input: { bullet: string; jobDescription: string }) {
  return `You are optimizing a single resume bullet point.

STRICT RULES:
- Keep ALL original meaning
- Do NOT remove any detail
- Do NOT shorten
- Do NOT generalize
- Only rephrase and improve clarity
- You may add relevant keywords from job description
- Keep it as exactly one bullet sentence/statement

Return ONLY the improved bullet.

ORIGINAL BULLET:
${input.bullet}

JOB DESCRIPTION:
${input.jobDescription}
`;
}

function buildRetryRewritePrompt(input: {
  originalBullet: string;
  previousAttempt: string;
  jobDescription: string;
}) {
  return `You removed information in your previous rewrite. Rewrite again and preserve every detail.

STRICT RULES:
- Keep all facts, metrics, technologies, dates, tools, and scope from ORIGINAL BULLET
- Do NOT shorten or summarize
- Do NOT remove nouns, numbers, or responsibilities
- Improve wording only
- Return exactly one bullet line only

ORIGINAL BULLET:
${input.originalBullet}

PREVIOUS ATTEMPT (INVALID):
${input.previousAttempt}

JOB DESCRIPTION:
${input.jobDescription}

Return ONLY the corrected bullet.
`;
}

async function rewriteBullet(
  openai: OpenAI,
  input: {
    bullet: string;
    jobDescription: string;
    minRatio?: number;
  }
) {
  const minRatio = input.minRatio ?? 0.7;

  const run = async (prompt: string) => {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4-turbo",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Follow instructions exactly. Return one rewritten bullet only, with no commentary.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    return unwrapModelText(completion.choices[0]?.message?.content ?? "")
      .replace(/^[-*•]\s+/, "")
      .trim();
  };

  const firstAttempt = await run(
    buildStrictRewritePrompt({
      bullet: input.bullet,
      jobDescription: input.jobDescription,
    })
  );

  if (firstAttempt && firstAttempt.length >= input.bullet.length * minRatio) {
    return firstAttempt;
  }

  const secondAttempt = await run(
    buildRetryRewritePrompt({
      originalBullet: input.bullet,
      previousAttempt: firstAttempt || "(empty)",
      jobDescription: input.jobDescription,
    })
  );

  if (secondAttempt && secondAttempt.length >= input.bullet.length * minRatio) {
    return secondAttempt;
  }

  return input.bullet;
}

function validateStructure(
  original: StructuredResume,
  updated: StructuredResume
): ValidationResult {
  if (original.sections.length !== updated.sections.length) {
    return { ok: false, reason: "Section count changed" };
  }

  const originalSnapshot = snapshotStructure(original);
  const updatedSnapshot = snapshotStructure(updated);

  for (let i = 0; i < originalSnapshot.length; i++) {
    const originalSection = originalSnapshot[i];
    const updatedSection = updatedSnapshot[i];

    if (originalSection.itemBulletLengths.length !== updatedSection.itemBulletLengths.length) {
      return { ok: false, reason: `Item count changed in section ${i + 1}` };
    }

    for (let j = 0; j < originalSection.itemBulletLengths.length; j++) {
      const originalBullets = originalSection.itemBulletLengths[j];
      const updatedBullets = updatedSection.itemBulletLengths[j];

      if (originalBullets.length !== updatedBullets.length) {
        return { ok: false, reason: `Bullet count changed in section ${i + 1}, item ${j + 1}` };
      }

      for (let k = 0; k < originalBullets.length; k++) {
        const originalLength = originalBullets[k];
        const updatedLength = updatedBullets[k];

        if (updatedLength <= 0) {
          return {
            ok: false,
            reason: `Empty bullet at section ${i + 1}, item ${j + 1}, bullet ${k + 1}`,
          };
        }

        if (originalLength > 0 && updatedLength < Math.floor(originalLength * 0.7)) {
          return {
            ok: false,
            reason: `Bullet shrank too much at section ${i + 1}, item ${j + 1}, bullet ${k + 1}`,
          };
        }
      }
    }
  }

  return { ok: true };
}

function rebuildResume(structured: StructuredResume) {
  const lines: string[] = [];

  for (const section of structured.sections) {
    if (section.headingRaw) {
      if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
        lines.push("");
      }
      lines.push(section.headingRaw);
    }

    for (const entry of section.entries) {
      lines.push(entry.raw);
    }
  }

  return lines.join("\n").trim();
}

async function generateStructuredResume(
  openai: OpenAI,
  input: {
    sourceResume: string;
    jobDescription: string;
  }
) {
  const original = parseStructuredResume(input.sourceResume);
  const updated: StructuredResume = {
    sections: original.sections.map((section) => ({
      ...section,
      entries: section.entries.map((entry) => ({ ...entry })),
    })),
  };

  for (const section of updated.sections) {
    for (let i = 0; i < section.entries.length; i++) {
      const entry = section.entries[i];
      if (entry.type !== "bullet") {
        continue;
      }

      const rewritten = await rewriteBullet(openai, {
        bullet: entry.text,
        jobDescription: input.jobDescription,
      });

      entry.text = rewritten;
      entry.raw = `${entry.prefix}${rewritten}`;
    }
  }

  const validation = validateStructure(original, updated);
  if (!validation.ok) {
    return {
      resumeMarkdown: input.sourceResume,
      validation,
    };
  }

  return {
    resumeMarkdown: rebuildResume(updated),
    validation,
  };
}

export async function generateResumeContent(input: {
  jobTitle: string;
  company: string;
  jobDescription: string;
  resumeText?: string;
  candidateName?: string;
}) {
  const openai = getClient();
  if (!openai) {
    throw new Error("OPENAI_API_KEY is required for resume generation");
  }

  const sourceResume = (input.resumeText ?? "").trim();
  if (!sourceResume) {
    throw new Error("Source resume text is required for generation");
  }

  const structuredResult = await generateStructuredResume(openai, {
    sourceResume,
    jobDescription: [
      `Job Title: ${input.jobTitle}`,
      `Company: ${input.company}`,
      input.jobDescription,
    ].join("\n"),
  });

  const resumeMarkdown = structuredResult.resumeMarkdown.trim();
  if (!resumeMarkdown) {
    throw new Error("Resume generation produced an empty output");
  }

  const candidateName =
    (input.candidateName ?? "").trim() ||
    extractCandidateNameFromResumeText(sourceResume) ||
    "Candidate";

  return {
    candidateName,
    resumeMarkdown,
    coverLetterMarkdown: "",
    validation: structuredResult.validation,
  };
}
