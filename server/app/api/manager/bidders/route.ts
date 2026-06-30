import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

const biddersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(100),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "manager:bidders:list", limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.manager && auth.user.role !== UserRole.admin) {
      return jsonError("Forbidden", 403);
    }

    const url = new URL(req.url);
    const { page, limit } = biddersQuerySchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const where = {
      role: UserRole.bidder,
      ...(auth.user.role === UserRole.manager
        ? { bidder: { managerId: auth.user.id } }
        : {}),
    };

    const select = {
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
                select: { fullName: true },
              },
            },
          },
        },
      },
      managerProfile: {
        select: {
          email: true,
          fullName: true,
          templateResumeUrl: true,
        },
      },
    };

    const [bidders, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return jsonOk({ items: bidders, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("manager bidders GET failed", error);
    return jsonError("Failed to load bidders", 500);
  }
}
