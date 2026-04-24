import { ApplicationStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { publishEvent } from "@/lib/realtime";
import { createNotifications, getBackofficeRecipientIds } from "@/lib/notifications";
import { applicationCreateSchema, applicationListQuerySchema } from "@/lib/validators";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "applications:list", limit: 120, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);

    const url = new URL(req.url);
    const parsed = applicationListQuerySchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      bidderId: url.searchParams.get("bidderId") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      sortBy: url.searchParams.get("sortBy") ?? undefined,
      sortOrder: url.searchParams.get("sortOrder") ?? undefined
    });

    if (!parsed.success) {
      return jsonError("Invalid query parameters", 422, parsed.error.flatten());
    }

    const {
      page,
      limit,
      status,
      bidderId,
      q,
      from,
      to,
      sortBy,
      sortOrder
    } = parsed.data;

    const baseWhere =
      auth.user.role === UserRole.bidder
        ? { bidderId: auth.user.id }
        : auth.user.role === UserRole.manager
          ? {
              bidder: {
                managerId: auth.user.id
              }
            }
          : {};
    const where = {
      ...baseWhere,
      ...(bidderId && auth.user.role !== UserRole.bidder ? { bidderId } : {}),
      ...(status ? { status } : {}),
      ...(from || to
        ? {
            submittedDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {})
            }
          }
        : {}),
      ...(q
        ? {
            OR: [
              { jobTitle: { contains: q } },
              { company: { contains: q } },
              { notes: { contains: q } }
            ]
          }
        : {})
    };

    const [items, total] = await Promise.all([
      prisma.application.findMany({
        where,
        include: { bidder: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.application.count({ where })
    ]);

    return jsonOk({
      items,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("applications GET failed", error);
    return jsonError("Failed to load applications", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "applications:create", limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.bidder) {
      return jsonError("Only bidders can submit applications", 403);
    }
    if (!auth.user.bidder) {
      return jsonError("Bidder profile is missing", 400);
    }

    const managerTemplateResumeUrl = auth.user.bidder.manager?.managerProfile?.templateResumeUrl ?? null;

    const body = await req.json().catch(() => null);
    const parsed = applicationCreateSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("Invalid application payload", 422, parsed.error.flatten());
    }

    const application = await prisma.application.create({
      data: {
        bidderId: auth.user.bidder.id,
        jobTitle: parsed.data.jobTitle.trim(),
        company: parsed.data.company.trim(),
        jobUrl: parsed.data.jobUrl || null,
        jobDescription: parsed.data.jobDescription.trim(),
        resumeUrl: parsed.data.resumeUrl || managerTemplateResumeUrl || auth.user.bidder.resumeUrl || null,
        notes: parsed.data.notes?.trim() || null,
        salaryMin: parsed.data.salaryMin,
        salaryMax: parsed.data.salaryMax,
        status: ApplicationStatus.submitted
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: "application.created",
        details: {
          applicationId: application.id,
          jobTitle: application.jobTitle,
          company: application.company
        }
      }
    });

    const backofficeRecipients = await getBackofficeRecipientIds();
    const assignmentRecipients = auth.user.bidder.managerId ? [auth.user.bidder.managerId] : [];
    await createNotifications([...new Set([...backofficeRecipients, ...assignmentRecipients, auth.user.id])], {
      type: "application.created",
      title: "New application submitted",
      body: `${auth.user.bidder.fullName} submitted ${application.jobTitle} at ${application.company}.`,
      link: `/bidder/applications/${application.id}`,
      data: {
        applicationId: application.id,
        jobTitle: application.jobTitle,
        company: application.company
      }
    });

    publishEvent(
      "application.created",
      { application },
      {
        roles: [UserRole.manager, UserRole.admin],
        userIds: [auth.user.id]
      }
    );

    return jsonOk(application, { status: 201 });
  } catch (error) {
    console.error("applications POST failed", error);
    return jsonError("Failed to create application", 500);
  }
}
