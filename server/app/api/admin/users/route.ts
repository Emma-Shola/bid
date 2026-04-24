import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { adminUserListQuerySchema } from "@/lib/validators";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "admin:users:list", limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const url = new URL(req.url);
    const parsed = adminUserListQuerySchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      role: url.searchParams.get("role") ?? undefined,
      isApproved: url.searchParams.get("isApproved") ?? undefined,
      sortBy: url.searchParams.get("sortBy") ?? undefined,
      sortOrder: url.searchParams.get("sortOrder") ?? undefined
    });

    if (!parsed.success) {
      return jsonError("Invalid query parameters", 422, parsed.error.flatten());
    }

    const { page, limit, q, role, isApproved, sortBy, sortOrder } = parsed.data;

    const where = {
      ...(role ? { role } : {}),
      ...(typeof isApproved === "boolean" ? { isApproved } : {}),
      ...(q
        ? {
            OR: [
              { username: { contains: q } },
              { bidder: { email: { contains: q } } },
              { bidder: { fullName: { contains: q } } },
              { managerProfile: { email: { contains: q } } },
              { managerProfile: { fullName: { contains: q } } }
            ]
          }
        : {})
    };

    const userSelect = {
      id: true,
      username: true,
      role: true,
      isApproved: true,
      createdAt: true,
      updatedAt: true,
      bidder: {
        include: {
          manager: {
            select: {
              id: true,
              username: true,
              managerProfile: {
                select: {
                  fullName: true
                }
              }
            }
          }
        }
      },
      managerProfile: {
        select: {
          email: true,
          fullName: true,
          templateResumeUrl: true
        }
      }
    } as const;

    let items: Array<Record<string, unknown>>;
    let total: number;

    try {
      [items, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: userSelect,
          orderBy: { [sortBy]: sortOrder },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.user.count({ where })
      ]);
    } catch (queryError) {
      console.warn("admin users list fallback query engaged", queryError);

      const fallbackSelect = {
        id: true,
        username: true,
        role: true,
        isApproved: true,
        createdAt: true,
        updatedAt: true,
        bidder: {
          select: {
            id: true,
            email: true,
            fullName: true,
            resumeUrl: true,
            totalPaid: true,
            managerId: true
          }
        },
        managerProfile: {
          select: {
            email: true,
            fullName: true,
            templateResumeUrl: true
          }
        }
      } as const;

      [items, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: fallbackSelect,
          orderBy: { [sortBy]: sortOrder },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.user.count({ where })
      ]);
    }

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
    console.error("admin users GET failed", error);
    return jsonError("Failed to load users", 500);
  }
}
