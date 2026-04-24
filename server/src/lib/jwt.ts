import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import type { AuthTokenPayload } from "./types";

const encoder = new TextEncoder();
export const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? "zaaa_token";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return encoder.encode(secret);
}

export async function signAuthToken(payload: AuthTokenPayload) {
  return new SignJWT({
    sid: payload.sid,
    username: payload.username,
    role: payload.role,
    isApproved: payload.isApproved
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getJwtSecret());
}

export async function verifyAuthToken(token: string) {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return {
    sub: String(payload.sub ?? ""),
    sid: String(payload.sid ?? ""),
    username: String(payload.username ?? ""),
    role: payload.role as AuthTokenPayload["role"],
    isApproved: Boolean(payload.isApproved)
  } satisfies AuthTokenPayload;
}

export function readAuthToken(req: NextRequest) {
  return req.cookies.get(AUTH_COOKIE_NAME)?.value ?? null;
}

export function shouldUseSecureCookies(req?: NextRequest) {
  const host = req?.headers.get("host") ?? "";
  if (host.includes("localhost") || host.startsWith("127.0.0.1")) {
    return false;
  }
  return process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
}

export function setAuthCookie(response: NextResponse, token: string, req?: NextRequest) {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(req),
    path: "/",
    maxAge: 60 * 15
  });
}

export function clearAuthCookie(response: NextResponse, req?: NextRequest) {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(req),
    path: "/",
    maxAge: 0
  });
}
