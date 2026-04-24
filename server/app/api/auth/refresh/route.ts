import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { getRefreshTokenFromRequest, rotateAuthSession, setSessionCookies } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { applyCorsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
  return applyCorsHeaders(req, new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "auth:refresh", limit: 20, windowMs: 10 * 60_000 });
    if (limited) return limited;

    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) {
      return jsonError("Unauthorized", 401);
    }

    const rotated = await rotateAuthSession(refreshToken, req);
    if (!rotated) {
      return jsonError("Unauthorized", 401);
    }

    const profile = await prisma.user.findUnique({
      where: { id: rotated.user.id },
      select: {
        bidder: {
          select: {
            id: true,
            email: true,
            fullName: true,
            resumeUrl: true,
            totalPaid: true,
            managerId: true,
            manager: {
              select: {
                id: true,
                username: true,
                managerProfile: {
                  select: {
                    fullName: true,
                    templateResumeUrl: true
                  }
                }
              }
            }
          }
        },
        managerProfile: {
          select: {
            email: true,
            fullName: true,
            templateResumeUrl: true
          }
        }
      }
    });

    const response = NextResponse.json({
      data: {
        user: {
          id: rotated.user.id,
          username: rotated.user.username,
          role: rotated.user.role,
          isApproved: rotated.user.isApproved
        },
        bidder: profile?.bidder ?? null,
        managerProfile: profile?.managerProfile ?? null
      }
    });

    setSessionCookies(response, rotated.accessToken, rotated.refreshToken, req);
    return applyCorsHeaders(req, response);
  } catch (error) {
    console.error("refresh POST failed", error);
    return applyCorsHeaders(req, jsonError("Failed to refresh session", 500));
  }
}
