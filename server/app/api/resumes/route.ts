import { Prisma, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { resumeListQuerySchema } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "resumes:list", limit: 120, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);

    const url = new URL(req.url);
    const parsed = resumeListQuerySchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      managerId: url.searchParams.get("managerId") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      sortOrder: url.searchParams.get("sortOrder") ?? undefined
    });

    if (!parsed.success) {
      return jsonError("Invalid query parameters", 422, parsed.error.flatten());
    }

    const { page, limit, managerId, q, sortOrder } = parsed.data;

    const where: Prisma.ResumeWhereInput = {};

    if (auth.user.role === UserRole.manager) {
      where.managerId = auth.user.id;
    } else if (auth.user.role === UserRole.bidder) {
      const bidderManagerId = auth.user.bidder?.managerId ?? null;
      if (!bidderManagerId) {
        return jsonOk({
          items: [],
          meta: {
            page,
            limit,
            total: 0,
            pages: 0
          }
        });
      }
      where.managerId = bidderManagerId;
    } else if (auth.user.role === UserRole.admin) {
      if (managerId) {
        where.managerId = managerId;
      }
    } else {
      return jsonError("Forbidden", 403);
    }

    if (q) {
      where.OR = [
        { title: { contains: q } },
        { fileUrl: { contains: q } }
      ];
    }

    const [items, total] = await Promise.all([
      prisma.resume.findMany({
        where,
        select: {
          id: true,
          managerId: true,
          title: true,
          fileUrl: true,
          createdAt: true,
          updatedAt: true,
          originalText: true,
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
          },
          createdBy: {
            select: {
              id: true,
              username: true
            }
          }
        },
        orderBy: { createdAt: sortOrder },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.resume.count({ where })
    ]);

    if (items.length === 0 && (auth.user.role === UserRole.manager || auth.user.role === UserRole.bidder)) {
      const fallbackManagerId =
        auth.user.role === UserRole.manager ? auth.user.id : auth.user.bidder?.managerId ?? null;

      if (fallbackManagerId) {
        const manager = await prisma.user.findUnique({
          where: { id: fallbackManagerId },
          select: {
            id: true,
            username: true,
            managerProfile: {
              select: {
                fullName: true,
                templateResumeUrl: true,
                templateResumeText: true
              }
            }
          }
        });

        if (manager?.managerProfile?.templateResumeUrl || manager?.managerProfile?.templateResumeText) {
          const fallbackItem = {
            id: `legacy-template-${fallbackManagerId}`,
            managerId: fallbackManagerId,
            title: `${manager.managerProfile?.fullName || manager.username} - Manager Template`,
          fileUrl: manager.managerProfile?.templateResumeUrl ?? null,
          openUrl: manager.managerProfile?.templateResumeUrl ? `/api/resumes/legacy-template-${fallbackManagerId}/file` : null,
          createdAt: new Date(),
          updatedAt: new Date(),
          textLength: manager.managerProfile?.templateResumeText?.length ?? 0,
            manager: {
              id: manager.id,
              username: manager.username,
              managerProfile: {
                fullName: manager.managerProfile?.fullName ?? null
              }
            },
            createdBy: null
          };

          return jsonOk({
            items: [fallbackItem],
            meta: {
              page,
              limit,
              total: 1,
              pages: 1
            }
          });
        }
      }
    }

    return jsonOk({
      items: items.map((item) => ({
        id: item.id,
        managerId: item.managerId,
        title: item.title,
        fileUrl: item.fileUrl,
        openUrl: item.fileUrl ? `/api/resumes/${item.id}/file` : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        textLength: item.originalText.length,
        manager: item.manager,
        createdBy: item.createdBy
      })),
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("resumes GET failed", error);
    return jsonError("Failed to load resumes", 500);
  }
}
