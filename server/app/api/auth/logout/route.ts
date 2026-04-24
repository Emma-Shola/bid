export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies, getRefreshTokenFromRequest, revokeSessionById, revokeSessionByRefreshToken } from "@/lib/session";
import { getAuthUser } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "auth:logout", limit: 30, windowMs: 10 * 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (auth?.session?.id) {
      await revokeSessionById(auth.session.id);
    } else {
      const refreshToken = getRefreshTokenFromRequest(req);
      if (refreshToken) {
        await revokeSessionByRefreshToken(refreshToken);
      }
    }

    const response = NextResponse.json({ data: { ok: true } });
    clearSessionCookies(response, req);
    return response;
  } catch (error) {
    console.error("logout POST failed", error);
    const response = NextResponse.json({ data: { ok: true } });
    clearSessionCookies(response, req);
    return response;
  }
}
