import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { checkDuplicateCompany } from "@/lib/resume/duplicate-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  company: z.string().trim().min(1).max(255)
});

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "ai:check-duplicate-company", limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.bidder) {
      return jsonError("Only bidders can check duplicate companies", 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid payload", 422, parsed.error.flatten());
    }

    const bidder = await prisma.bidderProfile.findUnique({
      where: { id: auth.user.id },
      include: { manager: { include: { managerProfile: true } } }
    });

    if (!bidder) {
      return jsonError("Bidder profile is missing", 400);
    }

    const duplicate = await checkDuplicateCompany({
      userId: auth.user.id,
      company: parsed.data.company,
      managerGenerationRulesRaw: bidder.manager?.managerProfile?.generationRules,
      appliedCompaniesRaw: bidder.manager?.managerProfile?.appliedCompanies
    });

    return NextResponse.json({ data: { duplicate } });
  } catch (error) {
    console.error("check-duplicate-company POST failed", error);
    return jsonError("Failed to check duplicate company", 500);
  }
}
