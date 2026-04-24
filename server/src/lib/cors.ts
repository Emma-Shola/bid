import { NextRequest, NextResponse } from "next/server";

function parseConfiguredOrigins(value?: string) {
  if (!value) return [];
  return value
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function isTrustedProductionOrigin(origin: string) {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith(".onrender.com");
  } catch {
    return false;
  }
}

const allowedOrigins = new Set([
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...parseConfiguredOrigins(process.env.CLIENT_URL),
  ...parseConfiguredOrigins(process.env.CLIENT_URLS)
]);

export function isAllowedCorsOrigin(origin: string) {
  return allowedOrigins.has(origin) || isTrustedProductionOrigin(origin);
}

export function applyCorsHeaders(req: NextRequest, response: NextResponse) {
  const origin = req.headers.get("origin");
  if (!origin || !isAllowedCorsOrigin(origin)) {
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