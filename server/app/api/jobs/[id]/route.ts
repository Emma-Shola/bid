import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { deleteBackgroundJob, getBackgroundJobById, setBackgroundJobApplied } from "@/lib/background-jobs";

const patchSchema = z.object({
  applied: z.boolean()
});

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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "jobs:delete", limit: 60, windowMs: 60_000 });
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

    if (auth.user.role !== UserRole.bidder && auth.user.role !== UserRole.admin) {
      return jsonError("Forbidden", 403);
    }

    await deleteBackgroundJob(id);

    return jsonOk({ deleted: true });
  } catch (error) {
    console.error("jobs DELETE failed", error);
    return jsonError("Failed to delete job", 500);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "jobs:patch", limit: 120, windowMs: 60_000 });
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

    if (auth.user.role !== UserRole.bidder && auth.user.role !== UserRole.admin) {
      return jsonError("Forbidden", 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid request body", 422, parsed.error.flatten());
    }

    const updated = await setBackgroundJobApplied(id, parsed.data.applied);

    return jsonOk({ job: updated });
  } catch (error) {
    console.error("jobs PATCH failed", error);
    return jsonError("Failed to update job", 500);
  }
}
