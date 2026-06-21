import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { backgroundJobListQuerySchema } from "@/lib/validators";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "bidder:jobs:list", limit: 90, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.bidder) return jsonError("Forbidden", 403);

    const url = new URL(req.url);
    const parsed = backgroundJobListQuerySchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      sortBy: url.searchParams.get("sortBy") ?? undefined,
      sortOrder: url.searchParams.get("sortOrder") ?? undefined,
    });

    if (!parsed.success) {
      return jsonError("Invalid query parameters", 422, parsed.error.flatten());
    }

    const { page, limit, status, q, from, to, sortBy, sortOrder } = parsed.data;

    const where = {
      userId: auth.user.id,
      type: "resume.generate",
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { type: { contains: q } },
              { status: { contains: q } },
              { error: { contains: q } },
              { deadLetterReason: { contains: q } },
            ],
          }
        : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const statuses = ["queued", "processing", "retrying", "qa_required", "completed", "failed", "dead_letter"] as const;

    const [items, total, statusCounts] = await Promise.all([
      prisma.backgroundJob.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.backgroundJob.count({ where }),
      Promise.all(statuses.map((jobStatus) => prisma.backgroundJob.count({ where: { ...where, status: jobStatus } }))),
    ]);

    return jsonOk({
      items,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        counts: statuses.reduce<Record<string, number>>((acc, jobStatus, index) => {
          acc[jobStatus] = statusCounts[index] ?? 0;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error("bidder jobs GET failed", error);
    return jsonError("Failed to load queue", 500);
  }
}
