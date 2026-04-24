import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

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

    const bidders = await prisma.user.findMany({
      where: {
        role: UserRole.bidder,
        ...(auth.user.role === UserRole.manager
          ? {
              bidder: {
                managerId: auth.user.id
              }
            }
          : {})
      },
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
      orderBy: { createdAt: "desc" },
    });

    return jsonOk({ items: bidders });
  } catch (error) {
    console.error("manager bidders GET failed", error);
    return jsonError("Failed to load bidders", 500);
  }
}
