import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { markAllNotificationsAsRead } from "@/lib/notifications";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "notifications:list", limit: 120, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);

    const url = new URL(req.url);
    const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20), 1), 100);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";

    const where = {
      userId: auth.user.id,
      ...(unreadOnly ? { isRead: false } : {})
    };

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: {
          userId: auth.user.id,
          isRead: false
        }
      })
    ]);

    return jsonOk({
      items,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        unreadCount
      }
    });
  } catch (error) {
    console.error("notifications GET failed", error);
    return jsonError("Failed to load notifications", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "notifications:mark-all", limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);

    await markAllNotificationsAsRead(auth.user.id);

    return jsonOk({ ok: true });
  } catch (error) {
    console.error("notifications PATCH failed", error);
    return jsonError("Failed to update notifications", 500);
  }
}

