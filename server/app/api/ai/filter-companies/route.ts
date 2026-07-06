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
import { checkDuplicateCompanies } from "@/lib/resume/duplicate-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  text: z.string().trim().min(5).max(30_000)
});

const ExtractedCompaniesSchema = z
  .object({
    companies: z.array(z.string())
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
    "This text was copied from a job board and may contain one or many job listings.",
    "Extract every distinct hiring company name mentioned.",
    "Return strict JSON only, nothing else.",
    "companies: an array of unique company names, in the order they first appear. No duplicates, no near-duplicate variants of the same company.",
    "If a listing is clearly placed by a staffing/recruiting agency on behalf of a named end client, use the end client's name instead of the agency's.",
    "Do not include job titles, locations, or any text that is not an actual company name.",
    "Never invent a company name that isn't actually present in the text. If you find none, return an empty array.",
    "",
    "TEXT:",
    text
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "ai:filter-companies", limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.bidder) {
      return jsonError("Only bidders can filter companies", 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Paste some job board text first", 422, parsed.error.flatten());
    }

    const openai = getClient();
    if (!openai) {
      return jsonError("OPENAI_API_KEY is required for this feature", 500);
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_INTERVIEW_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0,
      instructions:
        "You extract company names from job board text. Return only strict JSON matching the schema. Never invent a company name that isn't in the text.",
      input: buildPrompt(parsed.data.text),
      text: {
        format: zodTextFormat(ExtractedCompaniesSchema, "extracted_companies")
      }
    });

    const raw = normalizeWhitespace(response.output_text || "");
    if (!raw) {
      return jsonError("Could not extract any companies from this text", 500);
    }

    const extracted = ExtractedCompaniesSchema.parse(JSON.parse(raw));
    const companies = extracted.companies.map((name) => name.trim()).filter(Boolean);

    const bidder = await prisma.bidderProfile.findUnique({
      where: { id: auth.user.id },
      include: { manager: { include: { managerProfile: true } } }
    });

    if (!bidder) {
      return jsonError("Bidder profile is missing", 400);
    }

    const duplicates = await checkDuplicateCompanies({
      userId: auth.user.id,
      companies,
      managerGenerationRulesRaw: bidder.manager?.managerProfile?.generationRules,
      appliedCompaniesRaw: bidder.manager?.managerProfile?.appliedCompanies
    });

    const clearCompanies = companies.filter((companyName) => !duplicates.get(companyName)?.blocked);

    return NextResponse.json({
      data: {
        clearCompanies,
        totalExtracted: companies.length,
        blockedCount: companies.length - clearCompanies.length
      }
    });
  } catch (error) {
    console.error("filter-companies POST failed", error);
    return jsonError("Failed to filter companies", 500);
  }
}
