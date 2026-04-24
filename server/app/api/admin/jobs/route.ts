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
    const limited = await rateLimit(req, { key: "admin:jobs:list", limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const url = new URL(req.url);
    const parsed = backgroundJobListQuerySchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      userId: url.searchParams.get("userId") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      sortBy: url.searchParams.get("sortBy") ?? undefined,
      sortOrder: url.searchParams.get("sortOrder") ?? undefined
    });

    if (!parsed.success) {
      return jsonError("Invalid query parameters", 422, parsed.error.flatten());
    }

    const { page, limit, userId, type, status, q, from, to, sortBy, sortOrder } = parsed.data;

    const where = {
      ...(userId ? { userId } : {}),
      ...(type ? { type: { contains: type } } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { type: { contains: q } },
              { status: { contains: q } },
              { error: { contains: q } },
              { deadLetterReason: { contains: q } },
              { user: { username: { contains: q } } }
            ]
          }
        : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {})
            }
          }
        : {})
    };

    const statuses = ["queued", "processing", "retrying", "completed", "failed", "dead_letter"] as const;

    const [items, total, statusCounts] = await Promise.all([
      prisma.backgroundJob.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              role: true,
              isApproved: true
            }
          }
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.backgroundJob.count({ where }),
      Promise.all(statuses.map((jobStatus) => prisma.backgroundJob.count({ where: { ...where, status: jobStatus } })))
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
        }, {})
      }
    });
  } catch (error) {
    console.error("admin jobs GET failed", error);
    return jsonError("Failed to load jobs", 500);
  }
}
