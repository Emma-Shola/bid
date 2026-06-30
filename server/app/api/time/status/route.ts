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

    const active = await prisma.timeEntry.findFirst({
      where: { userId: auth.user.id, clockedOutAt: null },
      orderBy: { clockedInAt: "desc" },
    });

    return jsonOk({
      isClockedIn: !!active,
      activeEntry: active
        ? { id: active.id, clockedInAt: active.clockedInAt.toISOString() }
        : null,
    });
  } catch {
    return jsonError("Server error", 500);
  }
}
