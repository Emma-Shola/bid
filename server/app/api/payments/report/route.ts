import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";
import { paymentListQuerySchema } from "@/lib/validators";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "payments:report", limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.manager && auth.user.role !== UserRole.admin) {
      return jsonError("Forbidden", 403);
    }

    const url = new URL(req.url);
    const parsed = paymentListQuerySchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      bidderId: url.searchParams.get("bidderId") ?? undefined,
      managerId: url.searchParams.get("managerId") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      sortBy: url.searchParams.get("sortBy") ?? undefined,
      sortOrder: url.searchParams.get("sortOrder") ?? undefined
    });

    if (!parsed.success) {
      return jsonError("Invalid query parameters", 422, parsed.error.flatten());
    }

    const {
      page,
      limit,
      bidderId,
      managerId,
      from,
      to,
      q,
      sortBy,
      sortOrder
    } = parsed.data;

    const where = {
      ...(auth.user.role === UserRole.manager ? { managerId: auth.user.id } : {}),
      ...(bidderId ? { bidderId } : {}),
      ...(managerId && auth.user.role === UserRole.admin ? { managerId } : {}),
      ...(from || to
        ? {
            paymentDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {})
            }
          }
        : {}),
      ...(q
        ? {
            OR: [
              { notes: { contains: q } },
              { bidder: { email: { contains: q } } },
              { bidder: { fullName: { contains: q } } }
            ]
          }
        : {})
    };

    const [payments, summary, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: { bidder: true, manager: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.payment.aggregate({
        where,
        _sum: { amount: true },
        _count: true
      }),
      prisma.payment.count({ where })
    ]);

    return jsonOk({
      payments,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      summary: {
        totalAmount: summary._sum.amount ?? 0,
        count: summary._count
      }
    });
  } catch (error) {
    console.error("payments report GET failed", error);
    return jsonError("Failed to load payment report", 500);
  }
}
