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

    const active = await prisma.timeEntry.findFirst({
      where: { userId: auth.user.id, clockedOutAt: null },
      orderBy: { clockedInAt: "desc" },
    });
    if (!active) return jsonError("Not clocked in", 409);

    const now = new Date();
    const durationSecs = Math.floor((now.getTime() - active.clockedInAt.getTime()) / 1000);

    const updated = await prisma.timeEntry.update({
      where: { id: active.id },
      data: { clockedOutAt: now, durationSecs },
    });

    return jsonOk({
      id: updated.id,
      clockedInAt: updated.clockedInAt.toISOString(),
      clockedOutAt: updated.clockedOutAt!.toISOString(),
      durationSecs: updated.durationSecs!,
    });
  } catch {
    return jsonError("Server error", 500);
  }
}
