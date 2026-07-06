import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { toPrismaJson } from "@/lib/json";
import { normalizeCompanyName, parseAppliedCompanies, type AppliedCompanyEntry } from "@/lib/manager-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadManager(managerId: string) {
  const manager = await prisma.user.findUnique({
    where: { id: managerId },
    include: { managerProfile: true }
  });
  if (!manager || manager.role !== UserRole.manager) {
    return null;
  }
  return manager;
}

export async function GET(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "admin:manager:applied-companies:read", limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const manager = await loadManager(context.params.id);
    if (!manager) return jsonError("Manager account was not found", 404);

    const companies = parseAppliedCompanies(manager.managerProfile?.appliedCompanies).sort(
      (a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
    );

    return jsonOk({ companies });
  } catch (error) {
    console.error("admin manager applied-companies GET failed", error);
    return jsonError("Failed to load applied companies", 500);
  }
}

const addSchema = z.object({
  companies: z.array(z.string().trim().min(1).max(255)).min(1).max(2000)
});

export async function POST(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "admin:manager:applied-companies:add", limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const manager = await loadManager(context.params.id);
    if (!manager) return jsonError("Manager account was not found", 404);

    const body = await req.json().catch(() => null);
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid applied companies payload", 422, parsed.error.flatten());
    }

    const now = new Date().toISOString();
    const existing = parseAppliedCompanies(manager.managerProfile?.appliedCompanies);
    const byKey = new Map<string, AppliedCompanyEntry>(existing.map((entry) => [normalizeCompanyName(entry.company), entry]));

    for (const raw of parsed.data.companies) {
      const company = raw.trim();
      if (!company) continue;
      const key = normalizeCompanyName(company);
      if (!key) continue;
      byKey.set(key, { company, appliedAt: now });
    }

    const merged = Array.from(byKey.values());

    if (manager.managerProfile) {
      await prisma.managerProfile.update({
        where: { id: manager.id },
        data: { appliedCompanies: toPrismaJson(merged) }
      });
    } else {
      await prisma.managerProfile.create({
        data: {
          id: manager.id,
          email: `${manager.username}@example.com`,
          fullName: manager.username,
          appliedCompanies: toPrismaJson(merged)
        }
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "manager.applied-companies.added",
        details: { managerUserId: manager.id, addedCount: parsed.data.companies.length, totalCount: merged.length }
      }
    });

    return jsonOk({ companies: merged, totalCount: merged.length });
  } catch (error) {
    console.error("admin manager applied-companies POST failed", error);
    return jsonError("Failed to add applied companies", 500);
  }
}

const removeSchema = z.object({
  company: z.string().trim().min(1)
});

export async function DELETE(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "admin:manager:applied-companies:remove", limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const manager = await loadManager(context.params.id);
    if (!manager) return jsonError("Manager account was not found", 404);

    const body = await req.json().catch(() => null);
    const parsed = removeSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Company name is required", 422, parsed.error.flatten());
    }

    const key = normalizeCompanyName(parsed.data.company);
    const existing = parseAppliedCompanies(manager.managerProfile?.appliedCompanies);
    const remaining = existing.filter((entry) => normalizeCompanyName(entry.company) !== key);

    await prisma.managerProfile.update({
      where: { id: manager.id },
      data: { appliedCompanies: toPrismaJson(remaining) }
    });

    return jsonOk({ companies: remaining });
  } catch (error) {
    console.error("admin manager applied-companies DELETE failed", error);
    return jsonError("Failed to remove applied company", 500);
  }
}
