import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getBackgroundJobById } from "@/lib/background-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "jobs:detail", limit: 120, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);

    const { id } = params;
    const job = await getBackgroundJobById(id);

    if (!job) {
      return jsonError("Job not found", 404);
    }

    if (auth.user.role === UserRole.bidder && job.userId !== auth.user.id) {
      return jsonError("Forbidden", 403);
    }

    return jsonOk({ job });
  } catch (error) {
    console.error("jobs GET failed", error);
    return jsonError("Failed to load job", 500);
  }
}
