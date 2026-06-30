import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.bidder) return jsonError("Forbidden", 403);

    const body = await req.json().catch(() => null);
    const managerId = typeof body?.managerId === "string" ? body.managerId.trim() : null;
    if (!managerId) return jsonError("managerId is required", 422);

    // Verify this manager is actually assigned to this bidder
    const assignment = await prisma.bidderClientAssignment.findUnique({
      where: { bidderId_managerId: { bidderId: auth.user.id, managerId } },
    });
    if (!assignment) return jsonError("Client not assigned to this bidder", 403);

    await prisma.bidderProfile.update({
      where: { id: auth.user.id },
      data: { managerId },
    });

    return jsonOk({ managerId });
  } catch {
    return jsonError("Server error", 500);
  }
}
