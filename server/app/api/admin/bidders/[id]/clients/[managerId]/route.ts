import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  context: { params: { id: string; managerId: string } }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const { id, managerId } = context.params;

    const bidder = await prisma.bidderProfile.findUnique({ where: { id } });
    if (!bidder) return jsonError("Bidder not found", 404);

    await prisma.bidderClientAssignment.delete({
      where: { bidderId_managerId: { bidderId: id, managerId } },
    }).catch(() => null);

    // If we just removed the active workspace, switch to the next available assignment
    if (bidder.managerId === managerId) {
      const next = await prisma.bidderClientAssignment.findFirst({
        where: { bidderId: id },
        orderBy: { createdAt: "asc" },
      });
      await prisma.bidderProfile.update({
        where: { id },
        data: { managerId: next?.managerId ?? null },
      });
    }

    return jsonOk({ removed: managerId });
  } catch {
    return jsonError("Server error", 500);
  }
}
