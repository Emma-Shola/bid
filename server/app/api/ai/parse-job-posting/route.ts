import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeWhitespace } from "@/lib/resume/shared";
import { checkDuplicateCompany, type DuplicateCompanyCheck } from "@/lib/resume/duplicate-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  text: z.string().trim().min(20).max(20_000)
});

const ExtractedJobSchema = z
  .object({
    company: z.string(),
    jobTitle: z.string()
  })
  .strict();

let client: OpenAI | null = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  client ??= new OpenAI({ apiKey });
  return client;
}

function buildPrompt(text: string) {
  return [
    "Extract the hiring company name and job title from this job posting text.",
    "Return strict JSON only, nothing else.",
    "company: the actual hiring company's name only. If the posting is clearly placed by a staffing/recruiting agency on behalf of an end client and the end client is named in the text, use the end client's name instead of the agency's.",
    "jobTitle: the position/role title only — no location, employment type, or clearance/qualifier text appended.",
    "If you cannot confidently determine a field, return an empty string for it. Never guess or invent a company name or title that isn't actually present in the text.",
    "",
    "JOB POSTING TEXT:",
    text
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "ai:parse-job-posting", limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.bidder) {
      return jsonError("Only bidders can parse job postings", 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Paste more of the job posting text first", 422, parsed.error.flatten());
    }

    const openai = getClient();
    if (!openai) {
      return jsonError("OPENAI_API_KEY is required for this feature", 500);
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_INTERVIEW_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0,
      instructions:
        "You extract structured facts from job postings. Return only strict JSON matching the schema. Never invent a company name or job title that isn't in the text.",
      input: buildPrompt(parsed.data.text),
      text: {
        format: zodTextFormat(ExtractedJobSchema, "extracted_job")
      }
    });

    const raw = normalizeWhitespace(response.output_text || "");
    if (!raw) {
      return jsonError("Could not extract details from this text", 500);
    }

    const extracted = ExtractedJobSchema.parse(JSON.parse(raw));

    let duplicate: DuplicateCompanyCheck | null = null;
    if (extracted.company.trim()) {
      const bidder = await prisma.bidderProfile.findUnique({
        where: { id: auth.user.id },
        include: { manager: { include: { managerProfile: true } } }
      });

      if (bidder) {
        duplicate = await checkDuplicateCompany({
          userId: auth.user.id,
          company: extracted.company,
          managerGenerationRulesRaw: bidder.manager?.managerProfile?.generationRules,
          appliedCompaniesRaw: bidder.manager?.managerProfile?.appliedCompanies
        });
      }
    }

    return NextResponse.json({
      data: {
        company: extracted.company,
        jobTitle: extracted.jobTitle,
        duplicate
      }
    });
  } catch (error) {
    console.error("parse-job-posting POST failed", error);
    return jsonError("Failed to parse job posting", 500);
  }
}
