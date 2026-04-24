import { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { jsonError } from "./http";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type Bucket = {
  hits: number[];
};

declare global {
  // eslint-disable-next-line no-var
  var __zaaaRateLimitStore: Map<string, Bucket> | undefined;
}

const store = globalThis.__zaaaRateLimitStore ?? new Map<string, Bucket>();

if (!globalThis.__zaaaRateLimitStore) {
  globalThis.__zaaaRateLimitStore = store;
}

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN
      })
    : null;

const redisLimiters = new Map<string, Ratelimit>();

function getRedisLimiter(key: string, limit: number, windowMs: number) {
  const cacheKey = `${key}:${limit}:${windowMs}`;
  const existing = redisLimiters.get(cacheKey);
  if (existing) {
    return existing;
  }

  const limiter = new Ratelimit({
    redis: redis as Redis,
    limiter: Ratelimit.slidingWindow(limit, `${Math.max(1, Math.ceil(windowMs / 1000))} s`),
    analytics: true
  });

  redisLimiters.set(cacheKey, limiter);
  return limiter;
}

function getClientKey(req: NextRequest, key: string) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  return `${key}:${ip}`;
}

export async function rateLimit(req: NextRequest, options: RateLimitOptions) {
  const bucketKey = getClientKey(req, options.key);
  if (redis) {
    const limiter = getRedisLimiter(options.key, options.limit, options.windowMs);
    const result = await limiter.limit(bucketKey);
    if (!result.success) {
      const retryAfter = Math.max(Math.ceil((result.reset - Date.now()) / 1000), 1);
      return jsonError("Rate limit exceeded", 429, { retryAfter });
    }

    return null;
  }

  const now = Date.now();
  const windowStart = now - options.windowMs;
  const bucket = store.get(bucketKey) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((timestamp) => timestamp > windowStart);

  if (bucket.hits.length >= options.limit) {
    const resetAt = bucket.hits[0] + options.windowMs;
    const retryAfter = Math.max(Math.ceil((resetAt - now) / 1000), 1);
    store.set(bucketKey, bucket);
    return jsonError("Rate limit exceeded", 429, { retryAfter });
  }

  bucket.hits.push(now);
  store.set(bucketKey, bucket);
  return null;
}
