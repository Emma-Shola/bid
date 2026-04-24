import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/rbac";
import { markNotificationAsRead } from "@/lib/notifications";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "notifications:mark-one", limit: 120, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);

    const { id } = context.params;
    const result = await markNotificationAsRead(id, auth.user.id);

    if (result.count === 0) {
      return jsonError("Notification not found", 404);
    }

    return jsonOk({ ok: true });
  } catch (error) {
    console.error("notification PATCH failed", error);
    return jsonError("Failed to update notification", 500);
  }
}

