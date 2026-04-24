import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/jwt";
import { applyCorsHeaders } from "@/lib/cors";

const protectedPrefixes = [
  "/api/applications",
  "/api/payments",
  "/api/analytics",
  "/api/admin",
  "/api/ai"
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (req.method === "OPTIONS") {
    return applyCorsHeaders(req, new NextResponse(null, { status: 204 }));
  }

  if (!protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return applyCorsHeaders(req, NextResponse.next());
  }

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return applyCorsHeaders(req, NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  try {
    await verifyAuthToken(token);
    return applyCorsHeaders(req, NextResponse.next());
  } catch {
    return applyCorsHeaders(req, NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }
}

export const config = {
  matcher: ["/api/:path*"]
};
