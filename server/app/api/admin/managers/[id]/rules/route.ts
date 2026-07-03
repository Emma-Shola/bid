import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { toPrismaJson } from "@/lib/json";
import { ManagerGenerationRulesSchema } from "@/lib/manager-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "admin:manager:rules:update", limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const managerId = context.params.id;
    if (!managerId) return jsonError("Manager id is required", 422);

    const manager = await prisma.user.findUnique({
      where: { id: managerId },
      include: { managerProfile: true }
    });

    if (!manager || manager.role !== UserRole.manager) {
      return jsonError("Manager account was not found", 404);
    }

    const body = await req.json().catch(() => null);
    const parsed = ManagerGenerationRulesSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid generation rules payload", 422, parsed.error.flatten());
    }

    const profile = manager.managerProfile
      ? await prisma.managerProfile.update({
          where: { id: manager.id },
          data: { generationRules: toPrismaJson(parsed.data) }
        })
      : await prisma.managerProfile.create({
          data: {
            id: manager.id,
            email: `${manager.username}@example.com`,
            fullName: manager.username,
            generationRules: toPrismaJson(parsed.data)
          }
        });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "manager.rules.updated",
        details: {
          managerUserId: manager.id,
          generationRules: parsed.data
        }
      }
    });

    return jsonOk({
      generationRules: profile.generationRules
    });
  } catch (error) {
    console.error("admin manager rules PATCH failed", error);
    return jsonError("Failed to update manager generation rules", 500);
  }
}
