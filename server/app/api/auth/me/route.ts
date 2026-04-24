import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/rbac";
import { jsonError } from "@/lib/http";
import { applyCorsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
  return applyCorsHeaders(req, new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);

    if (!auth) {
      return jsonError("Unauthorized", 401);
    }

    const bidder = auth.user.bidder
      ? {
          id: auth.user.bidder.id,
          email: auth.user.bidder.email,
          fullName: auth.user.bidder.fullName,
          resumeUrl: auth.user.bidder.resumeUrl,
          totalPaid: auth.user.bidder.totalPaid,
          managerId: auth.user.bidder.managerId,
          manager: auth.user.bidder.manager
            ? {
                id: auth.user.bidder.manager.id,
                username: auth.user.bidder.manager.username,
                managerProfile: auth.user.bidder.manager.managerProfile
                  ? {
                      fullName: auth.user.bidder.manager.managerProfile.fullName,
                      templateResumeUrl: auth.user.bidder.manager.managerProfile.templateResumeUrl
                    }
                  : null
              }
            : null
        }
      : null;

    const managerProfile = auth.user.managerProfile
      ? {
          email: auth.user.managerProfile.email,
          fullName: auth.user.managerProfile.fullName,
          templateResumeUrl: auth.user.managerProfile.templateResumeUrl
        }
      : null;

    return applyCorsHeaders(req, Response.json({
      data: {
        user: {
          id: auth.user.id,
          username: auth.user.username,
          role: auth.user.role,
          isApproved: auth.user.isApproved
        },
        bidder,
        managerProfile
      }
    }));
  } catch (error) {
    console.error("me GET failed", error);
    return applyCorsHeaders(req, jsonError("Failed to load current user", 500));
  }
}
