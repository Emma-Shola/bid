import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { auditLogListQuerySchema } from "@/lib/validators";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "admin:audit:list", limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const url = new URL(req.url);
    const parsed = auditLogListQuerySchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      userId: url.searchParams.get("userId") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      sortOrder: url.searchParams.get("sortOrder") ?? undefined
    });

    if (!parsed.success) {
      return jsonError("Invalid query parameters", 422, parsed.error.flatten());
    }

    const { page, limit, userId, action, from, to, sortOrder } = parsed.data;

    const where = {
      ...(userId ? { userId } : {}),
      ...(action ? { action: { contains: action } } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {})
            }
          }
        : {})
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: true },
        orderBy: { createdAt: sortOrder },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.auditLog.count({ where })
    ]);

    return jsonOk({
      items,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("admin audit logs GET failed", error);
    return jsonError("Failed to load audit logs", 500);
  }
}
