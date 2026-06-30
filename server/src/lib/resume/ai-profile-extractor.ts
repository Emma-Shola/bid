import OpenAI from "openai";
import { createHash } from "crypto";
import { CandidateProfileSchema, CANDIDATE_PROFILE_VERSION, type CandidateProfile } from "./candidate-profile";

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return (_client ??= new OpenAI({ apiKey }));
}

const PROMPT = `You are a precise resume parser. Extract all information from the resume text and return it as a single JSON object.

Return ONLY valid JSON — no markdown fences, no explanation, no extra text.

Required structure:
{
  "personalInfo": {
    "name": "Complete full name including first, middle (if any), and last name",
    "email": "email address only",
    "phone": "phone number only",
    "location": "City, ST (e.g. Chandler, AZ) — NOT the full contact line",
    "linkedin": "full LinkedIn URL only (e.g. https://www.linkedin.com/in/username) — NOT surrounding text",
    "github": "full GitHub URL only, or empty string",
    "website": "other personal website URL, or empty string"
  },
  "employmentHistory": [
    {
      "company": "Exact employer name only — NOT the job title, NOT the dates",
      "role": "Exact job title",
      "startDate": "e.g. Feb 2026 or 02/2026 or 2020",
      "endDate": "e.g. Present or Jan 2024",
      "location": "City, ST or empty string"
    }
  ],
  "education": [
    {
      "institution": "School or university name only",
      "degree": "Degree and field (e.g. Bachelor of Science — Computer Science)",
      "dates": "e.g. 2013 - 2017",
      "location": "City, ST or empty string"
    }
  ],
  "certifications": ["certification name 1", "certification name 2"]
}

Critical rules:
- name: include the FULL name, including the last name — never truncate it
- personalInfo.location: city and state ONLY (e.g. "Chandler, AZ"), not the email or phone or full header line
- personalInfo.linkedin: the URL only — not the surrounding contact text
- employmentHistory.company: employer name ONLY — never include the job title or date range in this field
- employmentHistory: include EVERY job listed in the resume, most recent first
- certifications: only include items explicitly listed as certifications or licenses; leave [] if none
- Use empty string "" for any missing text fields, [] for missing arrays`;

export async function aiExtractCandidateProfile(input: {
  text: string;
  candidateName?: string;
}): Promise<CandidateProfile | null> {
  const openai = getClient();
  if (!openai) return null;

  const model = process.env.OPENAI_RESUME_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";

  try {
    const response = await openai.responses.create({
      model,
      temperature: 0,
      input: [
        {
          role: "user",
          content: `${PROMPT}\n\nRESUME TEXT:\n${input.text}`
        }
      ]
    });

    const raw = (response.output_text || "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const data = JSON.parse(raw) as Record<string, unknown>;
    const pi = (data.personalInfo || {}) as Record<string, string>;
    const empHistory = Array.isArray(data.employmentHistory) ? data.employmentHistory : [];
    const edu = Array.isArray(data.education) ? data.education : [];
    const certs = Array.isArray(data.certifications) ? data.certifications : [];

    return CandidateProfileSchema.parse({
      version: CANDIDATE_PROFILE_VERSION,
      personalInfo: {
        name: pi.name || input.candidateName || "",
        email: pi.email || "",
        phone: pi.phone || "",
        location: pi.location || "",
        linkedin: pi.linkedin || "",
        github: pi.github || "",
        website: pi.website || "",
      },
      employmentHistory: empHistory.map((item: Record<string, string>) => ({
        company: item.company || "",
        role: item.role || "",
        startDate: item.startDate || "",
        endDate: item.endDate || "",
        duration: [item.startDate, item.endDate].filter(Boolean).join(" - "),
        location: item.location || "",
      })),
      education: edu.map((item: Record<string, string>) => ({
        institution: item.institution || "",
        degree: item.degree || "",
        dates: item.dates || "",
        location: item.location || "",
        details: [],
      })),
      certifications: certs
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim())
        .filter(Boolean),
      sourceAudit: {
        textHash: createHash("sha256").update(input.text || "").digest("hex"),
        textLength: input.text.length,
        parserVersion: `ai-${model}`,
        confidence: 0.97,
      },
    });
  } catch (error) {
    console.warn(
      "[ai-profile-extractor] extraction failed:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}
