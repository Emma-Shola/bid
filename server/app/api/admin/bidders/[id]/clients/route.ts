import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: { id: string } }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const { id } = context.params;

    const bidder = await prisma.bidderProfile.findUnique({ where: { id } });
    if (!bidder) return jsonError("Bidder not found", 404);

    const assignments = await prisma.bidderClientAssignment.findMany({
      where: { bidderId: id },
      include: {
        manager: {
          select: {
            id: true,
            username: true,
            managerProfile: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return jsonOk(
      assignments.map((a) => ({
        managerId: a.managerId,
        managerName: a.manager.managerProfile?.fullName || a.manager.username,
        isActive: a.managerId === bidder.managerId,
      }))
    );
  } catch {
    return jsonError("Server error", 500);
  }
}

export async function POST(req: NextRequest, context: { params: { id: string } }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const { id } = context.params;
    const body = await req.json().catch(() => null);
    const managerId = typeof body?.managerId === "string" ? body.managerId.trim() : null;
    if (!managerId) return jsonError("managerId is required", 422);

    // Verify bidder exists
    const bidder = await prisma.bidderProfile.findUnique({ where: { id } });
    if (!bidder) return jsonError("Bidder not found", 404);

    // Verify manager exists
    const manager = await prisma.user.findUnique({
      where: { id: managerId },
      select: { id: true, role: true, username: true, managerProfile: { select: { fullName: true } } },
    });
    if (!manager || manager.role !== UserRole.manager) {
      return jsonError("Manager not found", 404);
    }

    // Upsert the assignment
    await prisma.bidderClientAssignment.upsert({
      where: { bidderId_managerId: { bidderId: id, managerId } },
      create: { bidderId: id, managerId },
      update: {},
    });

    // If this is their first client, set it as active
    if (!bidder.managerId) {
      await prisma.bidderProfile.update({
        where: { id },
        data: { managerId },
      });
    }

    return jsonOk({
      managerId,
      managerName: manager.managerProfile?.fullName || manager.username,
      isActive: !bidder.managerId || bidder.managerId === managerId,
    });
  } catch {
    return jsonError("Server error", 500);
  }
}
