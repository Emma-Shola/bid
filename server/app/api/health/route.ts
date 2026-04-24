export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN
      })
    : null;

export async function GET() {
  const checks = {
    database: "unknown",
    redis: redis ? "unknown" : "not_configured"
  };

  try {
    await prisma.user.count();
    checks.database = "ok";
  } catch (error) {
    checks.database = "error";
  }

  if (redis) {
    try {
      await redis.ping();
      checks.redis = "ok";
    } catch (error) {
      checks.redis = "error";
    }
  }

  const ok = checks.database === "ok" && (checks.redis === "ok" || checks.redis === "not_configured");

  return Response.json({
    data: {
      ok,
      service: "topbrass-backend",
      checks
    }
  });
}
