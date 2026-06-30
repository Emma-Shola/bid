import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.bidder) return jsonError("Forbidden", 403);

    const bidder = auth.user.bidder;
    if (!bidder) return jsonOk([]);

    let assignments = await prisma.bidderClientAssignment.findMany({
      where: { bidderId: auth.user.id },
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

    // Auto-migrate: if bidder has a managerId but no assignments yet, create the first one
    if (assignments.length === 0 && bidder.managerId) {
      await prisma.bidderClientAssignment.create({
        data: { bidderId: auth.user.id, managerId: bidder.managerId },
      }).catch(() => null);

      assignments = await prisma.bidderClientAssignment.findMany({
        where: { bidderId: auth.user.id },
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
    }

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
