import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { createNotifications, getBackofficeRecipientIds } from "@/lib/notifications";
import { publishEvent } from "@/lib/realtime.js";
import { registerSchema } from "@/lib/validators";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "auth:register", limit: 5, windowMs: 10 * 60_000 });
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("Invalid registration payload", 422, parsed.error.flatten());
    }

    const existing = await prisma.user.findUnique({
      where: { username: parsed.data.username }
    });

    if (existing) {
      return jsonError("Username is already taken", 409);
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({
      data: {
        username: parsed.data.username,
        passwordHash,
        role: parsed.data.role,
        isApproved: false
      }
    });

    const bidder =
      parsed.data.role === UserRole.bidder
        ? await prisma.bidderProfile.create({
            data: {
              id: user.id,
              email: parsed.data.email ?? `${parsed.data.username}@example.com`,
              fullName: parsed.data.fullName ?? parsed.data.username
            }
          })
        : null;

    const managerProfile =
      parsed.data.role === UserRole.manager
        ? await prisma.managerProfile.create({
            data: {
              id: user.id,
              email: parsed.data.email ?? `${parsed.data.username}@example.com`,
              fullName: parsed.data.fullName ?? parsed.data.username
            }
          })
        : null;

    const created = { user, bidder, managerProfile };

    const adminIds = await getBackofficeRecipientIds();

    if (adminIds.length > 0) {
      await createNotifications(adminIds, {
        type: "user.created",
        title: "New account pending approval",
        body: `${created.user.username} requested access and is waiting for approval.`,
        link: "/admin/approvals",
        data: {
          userId: created.user.id,
          username: created.user.username,
          role: created.user.role
        }
      });
    }

    publishEvent(
      "user.created",
      {
        user: {
          id: created.user.id,
          username: created.user.username,
          role: created.user.role,
          isApproved: created.user.isApproved
        }
      },
      {
        roles: [UserRole.admin]
      }
    );

    const response = NextResponse.json(
      {
        data: {
          user: {
            id: created.user.id,
            username: created.user.username,
            role: created.user.role,
            isApproved: created.user.isApproved
          },
          bidder: created.bidder,
          managerProfile: created.managerProfile,
          pendingApproval: true
        }
      }
      ,
      { status: 201 }
    );
    return response;
  } catch (error) {
    console.error("register POST failed", error);
    return jsonError("Failed to create account", 500);
  }
}
