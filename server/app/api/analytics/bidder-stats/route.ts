import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.manager && auth.user.role !== UserRole.admin) {
      return jsonError("Forbidden", 403);
    }

    const managerScopedFilter =
      auth.user.role === UserRole.manager
        ? {
            bidder: {
              managerId: auth.user.id
            }
          }
        : {};

    const [applications, paymentSummary, bidderCount] = await Promise.all([
      prisma.application.findMany({
        where: managerScopedFilter,
        select: { status: true }
      }),
      prisma.payment.aggregate({
        where: auth.user.role === UserRole.manager ? { managerId: auth.user.id } : undefined,
        _sum: { amount: true },
        _count: true
      }),
      prisma.bidderProfile.count({
        where: auth.user.role === UserRole.manager ? { managerId: auth.user.id } : undefined
      })
    ]);

    const applicationsByStatus = applications.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});

    return jsonOk({
      applicationsByStatus: Object.entries(applicationsByStatus).map(([status, count]) => ({
        status,
        count
      })),
      paymentSummary: {
        totalAmount: paymentSummary._sum.amount ?? 0,
        count: paymentSummary._count
      },
      bidderCount
    });
  } catch (error) {
    console.error("bidder-stats GET failed", error);
    return jsonError("Failed to load stats", 500);
  }
}
