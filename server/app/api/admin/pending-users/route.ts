import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

const pendingUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "admin:pending", limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.admin) return jsonError("Forbidden", 403);

    const url = new URL(req.url);
    const { page, limit } = pendingUsersQuerySchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const skip = (page - 1) * limit;

    let users: Array<Record<string, unknown>>;

    try {
      users = await prisma.user.findMany({
        where: { isApproved: false },
        skip,
        take: limit,
        select: {
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
        },
        orderBy: { createdAt: "asc" }
      });
    } catch (queryError) {
      console.warn("pending users fallback query engaged", queryError);
      users = await prisma.user.findMany({
        where: { isApproved: false },
        skip,
        take: limit,
        select: {
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
        },
        orderBy: { createdAt: "asc" }
      });
    }

    const total = await prisma.user.count({ where: { isApproved: false } });
    return jsonOk({ items: users, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("pending users GET failed", error);
    return jsonError("Failed to load pending users", 500);
  }
}
