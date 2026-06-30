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

    const existing = await prisma.timeEntry.findFirst({
      where: { userId: auth.user.id, clockedOutAt: null },
    });
    if (existing) return jsonError("Already clocked in", 409);

    const entry = await prisma.timeEntry.create({
      data: { userId: auth.user.id, clockedInAt: new Date() },
    });

    return jsonOk({
      id: entry.id,
      clockedInAt: entry.clockedInAt.toISOString(),
    });
  } catch {
    return jsonError("Server error", 500);
  }
}
