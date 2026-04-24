import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/jwt";

const protectedPrefixes = [
  "/api/applications",
  "/api/payments",
  "/api/analytics",
  "/api/admin",
  "/api/ai"
];

const allowedOrigins = new Set([
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.CLIENT_URL?.trim().replace(/\/$/, "") ?? ""
].filter(Boolean));

function applyCorsHeaders(req: NextRequest, response: NextResponse) {
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) {
    return response;
  }

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, X-CSRF-Token"
  );
  response.headers.set("Vary", "Origin");
  return response;
}

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
