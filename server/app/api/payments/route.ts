import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/rbac";
import { publishEvent } from "@/lib/realtime";
import { createNotifications, getBackofficeRecipientIds } from "@/lib/notifications";
import { paymentCreateSchema } from "@/lib/validators";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "payments:create", limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.manager && auth.user.role !== UserRole.admin) {
      return jsonError("Only managers can record payments", 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = paymentCreateSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("Invalid payment payload", 422, parsed.error.flatten());
    }

    const bidder = await prisma.bidderProfile.findUnique({
      where: { id: parsed.data.bidderId },
      select: {
        id: true,
        managerId: true
      }
    });

    if (!bidder) {
      return jsonError("Bidder not found", 404);
    }

    if (auth.user.role === UserRole.manager && bidder.managerId !== auth.user.id) {
      return jsonError("You can only record payments for your assigned bidders", 403);
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          bidderId: parsed.data.bidderId,
          managerId: auth.user.id,
          amount: parsed.data.amount,
          paymentDate: parsed.data.paymentDate ? new Date(parsed.data.paymentDate) : new Date(),
          notes: parsed.data.notes?.trim() || null
        }
      });

      await tx.bidderProfile.update({
        where: { id: parsed.data.bidderId },
        data: {
          totalPaid: {
            increment: parsed.data.amount
          }
        }
      });

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: "payment.created",
          details: {
            paymentId: created.id,
            bidderId: parsed.data.bidderId,
            amount: parsed.data.amount
          }
        }
      });

      return created;
    });

    const backofficeRecipients = await getBackofficeRecipientIds();
    await createNotifications([...backofficeRecipients, parsed.data.bidderId], {
      type: "payment.created",
      title: "Payment recorded",
      body: `A payment of ${parsed.data.amount} was recorded for the selected bidder.`,
      link: `/api/payments/report`,
      data: {
        paymentId: payment.id,
        bidderId: parsed.data.bidderId,
        amount: parsed.data.amount
      }
    });

    publishEvent(
      "payment.created",
      { payment },
      {
        roles: [UserRole.manager, UserRole.admin],
        userIds: [parsed.data.bidderId]
      }
    );

    return jsonOk(payment, { status: 201 });
  } catch (error) {
    console.error("payments POST failed", error);
    return jsonError("Failed to record payment", 500);
  }
}
