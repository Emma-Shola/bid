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
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const entries = await prisma.timeEntry.findMany({
      include: {
        user: {
          select: {
            id: true,
            username: true,
            bidder: { select: { fullName: true } },
          },
        },
      },
      orderBy: { clockedInAt: "desc" },
      take: 500,
    });

    return jsonOk(
      entries.map((e) => ({
        id: e.id,
        userId: e.userId,
        bidderName: e.user.bidder?.fullName || e.user.username,
        clockedInAt: e.clockedInAt.toISOString(),
        clockedOutAt: e.clockedOutAt?.toISOString() ?? null,
        durationSecs: e.durationSecs ?? null,
        isActive: !e.clockedOutAt,
      }))
    );
  } catch {
    return jsonError("Server error", 500);
  }
}
