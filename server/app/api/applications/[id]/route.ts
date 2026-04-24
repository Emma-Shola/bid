import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { publishEvent } from "@/lib/realtime";
import { createNotifications, getBackofficeRecipientIds } from "@/lib/notifications";
import { applicationUpdateSchema } from "@/lib/validators";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "applications:get", limit: 120, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);

    const { id } = context.params;
    const application = await prisma.application.findUnique({
      where: { id },
      include: { bidder: true }
    });

    if (!application) return jsonError("Application not found", 404);

    const canRead =
      auth.user.role === UserRole.bidder
        ? application.bidderId === auth.user.id
        : auth.user.role === UserRole.manager
          ? application.bidder.managerId === auth.user.id
          : true;

    if (!canRead) return jsonError("Forbidden", 403);

    return jsonOk(application);
  } catch (error) {
    console.error("applications GET [id] failed", error);
    return jsonError("Failed to load application", 500);
  }
}

export async function PUT(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "applications:update", limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);

    const { id } = context.params;
    const body = await req.json().catch(() => null);
    const parsed = applicationUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("Invalid application payload", 422, parsed.error.flatten());
    }

    const existing = await prisma.application.findUnique({
      where: { id },
      include: { bidder: true }
    });

    if (!existing) {
      return jsonError("Application not found", 404);
    }

    const canEditOwn = auth.user.role === UserRole.bidder && existing.bidderId === auth.user.id;
    const canEditAsManager =
      auth.user.role === UserRole.admin ||
      (auth.user.role === UserRole.manager && existing.bidder.managerId === auth.user.id);

    if (!canEditOwn && !canEditAsManager) {
      return jsonError("Forbidden", 403);
    }

    const updated = await prisma.application.update({
      where: { id },
      data: {
        jobTitle: parsed.data.jobTitle?.trim() ?? existing.jobTitle,
        company: parsed.data.company?.trim() ?? existing.company,
        jobUrl: parsed.data.jobUrl === "" ? null : parsed.data.jobUrl ?? existing.jobUrl,
        jobDescription: parsed.data.jobDescription?.trim() ?? existing.jobDescription,
        resumeUrl: parsed.data.resumeUrl === "" ? null : parsed.data.resumeUrl ?? existing.resumeUrl,
        notes: parsed.data.notes?.trim() ?? existing.notes,
        salaryMin: parsed.data.salaryMin ?? existing.salaryMin,
        salaryMax: parsed.data.salaryMax ?? existing.salaryMax,
        status: canEditAsManager ? parsed.data.status ?? existing.status : existing.status
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "application.updated",
        details: {
          applicationId: updated.id,
          status: updated.status
        }
      }
    });

    const backofficeRecipients = await getBackofficeRecipientIds();
    await createNotifications([...backofficeRecipients, existing.bidderId], {
      type: "application.updated",
      title: "Application updated",
      body: `${existing.jobTitle} at ${existing.company} was updated.`,
      link: `/bidder/applications/${updated.id}`,
      data: {
        applicationId: updated.id,
        status: updated.status
      }
    });

    publishEvent(
      "application.updated",
      { application: updated },
      {
        roles: [UserRole.manager, UserRole.admin],
        userIds: [auth.user.id, existing.bidderId]
      }
    );

    return jsonOk(updated);
  } catch (error) {
    console.error("applications PUT failed", error);
    return jsonError("Failed to update application", 500);
  }
}

export async function DELETE(req: NextRequest, context: { params: { id: string } }) {
  try {
    const limited = await rateLimit(req, { key: "applications:delete", limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);

    const { id } = context.params;
    const existing = await prisma.application.findUnique({
      where: { id },
      include: {
        bidder: {
          select: {
            managerId: true
          }
        }
      }
    });

    if (!existing) {
      return jsonError("Application not found", 404);
    }

    const canDeleteOwn = auth.user.role === UserRole.bidder && existing.bidderId === auth.user.id;
    const canDeleteAsManager =
      auth.user.role === UserRole.admin ||
      (auth.user.role === UserRole.manager && existing.bidder.managerId === auth.user.id);

    if (!canDeleteOwn && !canDeleteAsManager) {
      return jsonError("Forbidden", 403);
    }

    await prisma.application.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "application.deleted",
        details: { applicationId: id }
      }
    });

    const backofficeRecipients = await getBackofficeRecipientIds();
    await createNotifications([...backofficeRecipients, existing.bidderId], {
      type: "application.deleted",
      title: "Application deleted",
      body: `${existing.jobTitle} at ${existing.company} was deleted.`,
      link: `/api/applications/${id}`,
      data: {
        applicationId: id
      }
    });

    publishEvent(
      "application.deleted",
      { applicationId: id },
      {
        roles: [UserRole.manager, UserRole.admin],
        userIds: [auth.user.id, existing.bidderId]
      }
    );

    return jsonOk({ deleted: true });
  } catch (error) {
    console.error("applications DELETE failed", error);
    return jsonError("Failed to delete application", 500);
  }
}
