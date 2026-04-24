import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";
import { clearAuthCookie, getCookieSameSite, setAuthCookie, shouldUseSecureCookies, signAuthToken } from "./jwt";
import type { User } from "@prisma/client";

export const AUTH_REFRESH_COOKIE_NAME = process.env.AUTH_REFRESH_COOKIE_NAME ?? "zaaa_refresh";
const REFRESH_TOKEN_BYTES = 64;
const REFRESH_TOKEN_DAYS = 30;

export type SessionUser = Pick<User, "id" | "username" | "role" | "isApproved">;

function refreshTokenExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
}

function hashRefreshToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createRefreshToken() {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
}

function getClientIp(req?: NextRequest) {
  return (
    req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req?.headers.get("x-real-ip") ??
    null
  );
}

export async function createAuthSession(user: SessionUser, req?: NextRequest) {
  const refreshToken = createRefreshToken();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiry(),
      userAgent: req?.headers.get("user-agent") ?? null,
      ipAddress: getClientIp(req) ?? null
    }
  });

  const accessToken = await signAuthToken({
    sub: user.id,
    sid: session.id,
    username: user.username,
    role: user.role,
    isApproved: user.isApproved
  });

  return { accessToken, refreshToken, session };
}

export async function rotateAuthSession(refreshToken: string, req?: NextRequest) {
  const tokenHash = hashRefreshToken(refreshToken);
  const now = new Date();
  const found = await prisma.session.findFirst({
    where: { refreshTokenHash: tokenHash },
    include: { user: true }
  });

  const session = found && found.revokedAt === null && found.expiresAt > now ? found : null;

  if (!session) {
    return null;
  }

  const nextRefreshToken = createRefreshToken();
  const updated = await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashRefreshToken(nextRefreshToken),
      expiresAt: refreshTokenExpiry(),
      lastUsedAt: new Date(),
      userAgent: req?.headers.get("user-agent") ?? session.userAgent,
      ipAddress: getClientIp(req) ?? session.ipAddress
    },
    include: { user: true }
  });

  const accessToken = await signAuthToken({
    sub: updated.userId,
    sid: updated.id,
    username: updated.user.username,
    role: updated.user.role,
    isApproved: updated.user.isApproved
  });

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    session: updated,
    user: updated.user
  };
}

export async function getSessionByAccessToken(sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt <= new Date()) return null;
  return session;
}

export async function revokeSessionById(sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (session && session.revokedAt === null) {
    await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }
}

export async function revokeSessionByRefreshToken(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  const session = await prisma.session.findFirst({ where: { refreshTokenHash: tokenHash } });
  if (session && session.revokedAt === null) {
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  }
}

export async function revokeSessionsByUserId(userId: string) {
  const sessions = await prisma.session.findMany({ where: { userId } });
  const activeIds = sessions.filter((s) => s.revokedAt === null).map((s) => s.id);
  if (activeIds.length > 0) {
    await prisma.session.updateMany({ where: { id: { in: activeIds } }, data: { revokedAt: new Date() } });
  }
}

export function setSessionCookies(response: NextResponse, accessToken: string, refreshToken: string, req?: NextRequest) {
  setAuthCookie(response, accessToken, req);
  response.cookies.set(AUTH_REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: getCookieSameSite(),
    secure: shouldUseSecureCookies(req),
    path: "/",
    maxAge: 60 * 60 * 24 * REFRESH_TOKEN_DAYS
  });
}

export function clearSessionCookies(response: NextResponse, req?: NextRequest) {
  clearAuthCookie(response, req);
  response.cookies.set(AUTH_REFRESH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: getCookieSameSite(),
    secure: shouldUseSecureCookies(req),
    path: "/",
    maxAge: 0
  });
}

export function getRefreshTokenFromRequest(req: NextRequest) {
  return req.cookies.get(AUTH_REFRESH_COOKIE_NAME)?.value ?? null;
}
