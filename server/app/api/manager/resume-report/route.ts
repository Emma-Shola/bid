import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getResumeReportRows } from "@/lib/resume/resume-report";
import { buildResumeReportWorkbook } from "@/lib/resume/report-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeFileNamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
}

export async function GET(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "manager:resume-report", limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.manager && auth.user.role !== UserRole.admin) {
      return jsonError("Forbidden", 403);
    }

    let managerId = auth.user.id;
    let managerLabel = auth.user.username;

    if (auth.user.role === UserRole.admin) {
      const requestedManagerId = req.nextUrl.searchParams.get("managerId");
      if (!requestedManagerId) {
        return jsonError("managerId is required for an admin export", 422);
      }

      const manager = await prisma.user.findUnique({
        where: { id: requestedManagerId },
        select: { id: true, username: true, role: true, managerProfile: { select: { fullName: true } } }
      });

      if (!manager || manager.role !== UserRole.manager) {
        return jsonError("Manager account was not found", 404);
      }

      managerId = manager.id;
      managerLabel = manager.managerProfile?.fullName || manager.username;
    } else {
      const self = await prisma.user.findUnique({
        where: { id: auth.user.id },
        select: { managerProfile: { select: { fullName: true } } }
      });
      managerLabel = self?.managerProfile?.fullName || auth.user.username;
    }

    const rows = await getResumeReportRows(managerId);

    const wantsFile = req.nextUrl.searchParams.get("format") === "xlsx";
    if (!wantsFile) {
      return jsonOk({ rows });
    }

    const buffer = await buildResumeReportWorkbook(rows);
    const fileBase = sanitizeFileNamePart(`resume-activity-${managerLabel}-${new Date().toISOString().slice(0, 10)}`);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    console.error("manager resume-report GET failed", error);
    return jsonError("Failed to build resume activity report", 500);
  }
}
