import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword } from "@/lib/password";
import { createAuthSession, setSessionCookies } from "@/lib/session";
import { loginSchema } from "@/lib/validators";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "auth:login", limit: 10, windowMs: 10 * 60_000 });
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("Invalid login payload", 422, parsed.error.flatten());
    }

    const user = await prisma.user.findUnique({
      where: { username: parsed.data.username },
      select: {
        id: true,
        username: true,
        role: true,
        isApproved: true,
        passwordHash: true,
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

    if (!user) {
      return jsonError("Invalid username or password", 401);
    }

    const valid = await comparePassword(parsed.data.password, user.passwordHash);
    if (!valid) {
      return jsonError("Invalid username or password", 401);
    }

    if (!user.isApproved) {
      return jsonError("Account is pending admin approval", 403);
    }

    const authSession = await createAuthSession(user, req);

    const response = NextResponse.json({
      data: {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          isApproved: user.isApproved
        },
        bidder: user.bidder,
        managerProfile: user.managerProfile
      },
    });

    setSessionCookies(response, authSession.accessToken, authSession.refreshToken, req);
    return response;
  } catch (error) {
    console.error("login POST failed", error);
    return jsonError("Failed to log in", 500);
  }
}
